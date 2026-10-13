// 明示的な実API送信許可がある場合だけ実行。README以外へ入力・画像・応答を保存しない。
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { profiles, threads, CRITERIA_VERSION } from '../lib/fixtures.ts';
import { callReal } from '../lib/real-adapters.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
process.loadEnvFile('.env.local');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const captures = [];
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3001');
  const image = await page.evaluate(async () => {
    const video = document.createElement('video'); video.muted = true; video.src = '/samples/csv-import.webm';
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
    const sought = new Promise(resolve => { video.onseeked = resolve; }); video.currentTime = 5; await sought;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvas = document.createElement('canvas');
    const ratio = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * ratio); canvas.height = Math.round(video.videoHeight * ratio);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/jpeg', .85);
    video.pause(); video.removeAttribute('src'); video.load(); return image;
  });
  for (const model of ['jev', 'decisions', 'd1', 'clef']) {
    const input = model === 'jev' || model === 'decisions'
      ? { kind: 'relevance', model, profile: profiles[0], thread: threads[0] }
      : { kind: 'video', model, image };
    let raw;
    // Capture a bounded response in memory; callReal still validates the actual provider answer.
    const captureFetch = async (url, init) => {
      const response = await fetch(url, init);
      if (response.ok) {
        const reader = response.body.getReader(); const chunks = []; let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            size += value.length; if (size > 262144) { await reader.cancel(); throw new Error('Response exceeded limit'); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
        const bytes = Buffer.concat(chunks); raw = JSON.parse(bytes.toString('utf8'));
        return new Response(bytes, { status: response.status, headers: { 'Content-Type': 'application/json' } });
      }
      return response;
    };
    const normalized = { ...await callReal(input, process.env, new AbortController().signal, captureFetch), criteria: CRITERIA_VERSION };
    const data = model === 'clef' ? raw.result : raw;
    // Only model, validated answers, and numeric usage are published. Omit request/account IDs.
    const safeAnswer = answer => Object.fromEntries(Object.entries(answer).filter(([key, value]) =>
      ['name', 'type', 'score', 'choice', 'confidence'].includes(key) && ['string', 'number'].includes(typeof value)
    ));
    const answers = Array.isArray(data.answers) ? data.answers.map(safeAnswer)
      : Object.fromEntries(Object.entries(data.answers).map(([name, answer]) => [name, safeAnswer(answer)]));
    const safe = { model: data.model, answers };
    if (data.usage && typeof data.usage === 'object') safe.usage = Object.fromEntries(Object.entries(data.usage).filter(([key, value]) => /^[a-z_]+$/.test(key) && typeof value === 'number' && Number.isFinite(value)));
    const excerpt = model === 'clef' ? { success: raw.success, result: safe } : safe;
    const encoded = JSON.stringify({ excerpt, normalized });
    const secretNames = ['TYPESAFE_API_KEY', 'OPENAI_API_KEY', 'LIQUID_API_KEY', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'];
    if (secretNames.some(name => process.env[name] && encoded.includes(process.env[name]))) throw new Error('Sensitive value detected; README not modified');
    captures.push({ model, excerpt, normalized, at: new Date().toISOString() });
    console.log(`${model}: actual response captured and validated`);
  }
} finally { await browser.close(); }

const json = value => '```json\n' + JSON.stringify(value, null, 2) + '\n```';
let readme = readFileSync('README.md', 'utf8');
const oldIntro = 'レスポンスは形式を説明するために作成した例で、実API応答の原文記録ではありません。数値は説明用です。モデルが返す確率分布・confidence・usageなど、アプリが参照しない項目は省略しています。';
const newIntro = `レスポンスは同梱サンプルを実APIで判定して取得した実際の値です（取得日時：${captures[0].at}〜${captures.at(-1).at}、UTC）。掲載する項目の値は変更していません。APIキー・アカウントID・リクエストIDと、確率分布などの付加項目は省略しています。応答の抜粋であり、再実行時に同じ値になるとは限りません。`;
if (!readme.includes(oldIntro)) throw new Error('Expected README introduction not found');
readme = readme.replace(oldIntro, newIntro);
const names = ['Jev', 'OpenAI Decisions API', 'Liquid Hosted d1', 'Cloudflare Clef Flash'];
for (let i = 0; i < names.length; i++) {
  const start = readme.indexOf(`### ${names[i]}\n`); const end = readme.indexOf('\n### ', start + 4);
  const section = readme.slice(start, end);
  const marker = section.indexOf('レスポンス例（参照する項目の抜粋）：');
  if (marker < 0) throw new Error('Expected response section not found');
  const replacement = section.slice(0, marker) + `<details>\n<summary>実APIレスポンス（取得値の抜粋）</summary>\n\n${json(captures[i].excerpt)}\n\n</details>\n`;
  readme = readme.slice(0, start) + replacement + readme.slice(end);
}
const start = readme.indexOf('### 画面へ返す共通形式');
readme = readme.slice(0, start) + `### 画面へ返す共通形式\n
アプリは各モデルの回答を共通形式へ変換します。関連度は \`Math.round(100 * score / 4)\` で0〜100へ変換し、動画の英数字IDを日本語タグへ戻します。以下も今回取得した実際の結果・処理時間です。

<details>
<summary>Jevから変換した /api/decide のレスポンス</summary>

${json(captures[0].normalized)}

</details>

<details>
<summary>d1から変換した /api/decide のレスポンス</summary>

${json(captures[2].normalized)}

</details>

不正な回答・拒否・HTTPエラーは成功形式へ変換せず、安全なエラー文を返します。外部サービスの生エラー本文やキーは返しません。モックは別の /api/mock を使い、mode: "mock" を返します。
`;
writeFileSync('README.md', readme);
console.log('README updated with four real response excerpts and expandable request/response sections.');
