// Developer-only asset generator. Uses a reviewed, preinstalled Playwright runtime.
// Run against the local server; no website or data is sent outside loopback.
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto(`${base}/import`);
  await page.getByRole('heading', { name: '取引先CSV取り込み', exact: true }).waitFor();
  const images = [];
  const capture = async () => images.push('data:image/png;base64,' + (await page.screenshot()).toString('base64'));
  await capture();
  await page.getByRole('button', { name: '不備のあるCSVを選ぶ' }).click();
  await page.getByRole('alert').filter({ hasText: '3行目のメールアドレスが未入力です' }).waitFor();
  await capture();
  await page.getByRole('button', { name: '修正済みCSVを選ぶ' }).click();
  await page.getByRole('cell', { name: 'saku@example.test', exact: true }).waitFor();
  await capture();
  await page.getByRole('button', { name: '取り込む', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await capture();
  await page.getByRole('button', { name: '実行', exact: true }).click();
  await page.getByText('取り込みに失敗しました。再試行しますか？', { exact: true }).waitFor();
  await capture();
  await page.getByRole('button', { name: '再試行', exact: true }).click();
  await page.getByText('3件の取り込みが完了しました', { exact: true }).waitFor();
  await capture();
  const data = await page.evaluate(async shots => {
    const images = await Promise.all(shots.map(src => new Promise(resolve => { const image = new Image(); image.onload = () => resolve(image); image.src = src; })));
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
    const context = canvas.getContext('2d');
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 1_500_000 });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise(resolve => { recorder.onstop = resolve; });
    context.drawImage(images[0], 0, 0); recorder.start();
    const start = performance.now();
    await new Promise(resolve => {
      const timer = setInterval(() => {
        const elapsed = performance.now() - start;
        context.drawImage(images[Math.min(5, Math.floor((elapsed + 100) / 4000))], 0, 0);
        if (elapsed >= 24_000) { clearInterval(timer); recorder.stop(); resolve(); }
      }, 100);
    });
    await stopped; stream.getTracks().forEach(t => t.stop());
    return await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); });
  }, images);
  // MediaRecorder omits duration. Add Matroska Duration for finite metadata and seeking.
  const original = Buffer.from(data, 'base64');
  function vint(at, isId = false) {
    let n = 1; while (n <= 8 && !(original[at] & (1 << (8 - n)))) n++;
    if (n > 8) throw new Error('Invalid EBML');
    let value = isId ? original[at] : original[at] & ((1 << (8 - n)) - 1);
    for (let i = 1; i < n; i++) value = value * 256 + original[at + i];
    return { n, value };
  }
  function size(value) {
    for (let n = 1; n <= 8; n++) {
      if (value < 2 ** (7 * n) - 1) {
        const out = Buffer.alloc(n); let v = value;
        for (let i = n - 1; i >= 0; i--) { out[i] = v % 256; v = Math.floor(v / 256); }
        out[0] |= 1 << (8 - n); return out;
      }
    }
    throw new Error('EBML element too large');
  }
  let p = 0; let segment;
  while (p < original.length) {
    const id = vint(p, true); const len = vint(p + id.n); const start = p + id.n + len.n;
    if (id.value === 0x18538067) { segment = { p, id, len, start }; break; }
    p = start + len.value;
  }
  if (!segment) throw new Error('No WebM Segment');
  p = segment.start; let info;
  while (p < original.length) {
    const id = vint(p, true); const len = vint(p + id.n); const start = p + id.n + len.n;
    if (id.value === 0x1549a966) { info = { p, id, len, start, end: start + len.value }; break; }
    p = start + len.value;
  }
  if (!info) throw new Error('No WebM Info');
  const duration = Buffer.alloc(11); duration.set([0x44, 0x89, 0x88]); duration.writeDoubleBE(24_000, 3);
  const infoPayload = Buffer.concat([original.subarray(info.start, info.end), duration]);
  const newInfo = Buffer.concat([original.subarray(info.p, info.p + info.id.n), size(infoPayload.length), infoPayload]);
  const video = Buffer.concat([original.subarray(0, info.p), newInfo, original.subarray(info.end)]);
  await writeFile('public/samples/csv-import.webm', video);
  const manifest = { id: 'csv-import-v1', file: 'csv-import.webm', duration: 24, sha256: createHash('sha256').update(video).digest('hex') };
  await writeFile('public/samples/video-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  await page.goto(base);
  const metadata = await page.evaluate(async encoded => {
    const bytes = Uint8Array.from(atob(encoded), x => x.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'video/webm' }));
    const video = document.createElement('video'); video.src = url; video.preload = 'auto';
    await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
    const duration = video.duration;
    video.currentTime = 17;
    await new Promise((resolve, reject) => { video.onseeked = resolve; video.onerror = reject; });
    const result = { duration, seek: video.currentTime, width: video.videoWidth, height: video.videoHeight };
    URL.revokeObjectURL(url); return result;
  }, video.toString('base64'));
  if (metadata.duration !== 24 || metadata.seek !== 17) throw new Error('Sample video metadata failed');
  console.log(JSON.stringify({ bytes: video.length, ...metadata }));
} finally { await browser.close(); }
