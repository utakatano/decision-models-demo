// Run manually only with authorization for all four provider calls using bundled samples.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3001');
 await page.getByLabel('モード',{exact:true}).selectOption('real');
 for(const model of ['jev','decisions']) {
  await page.locator('#relevance-model').selectOption(model);
  await page.getByRole('button',{name:'判定する',exact:true}).click();
  await page.getByRole('status').filter({hasText:'完了：処理済み 50 / 50件、失敗 0件'}).waitFor({timeout:180000});
  await page.waitForFunction(model=>document.querySelector('.thread-list').dataset.appliedModel===model,model);
  assert.ok(await page.locator('.thread-judgment small').first().innerText());
  console.log(`${model}: UI real 50/50 successful`);
 }
 await page.getByRole('tab',{name:'録画の確認箇所抽出'}).click();
 await page.getByRole('button',{name:'サンプル動画を読み込む'}).click();
 const panel=page.getByRole('tabpanel',{name:'録画の確認箇所抽出'});
 const select=panel.getByRole('combobox').first();
 for(const model of ['d1','clef']) {
  await select.selectOption(model);
  await page.getByRole('button',{name:'解析する',exact:true}).click();
  await page.getByRole('status').filter({hasText:/完了：処理済み 24 \/ 24枚、.*失敗 0枚/}).waitFor({timeout:180000});
  const thumbnail=panel.locator('.detection').first();await thumbnail.click();
  assert.equal(await thumbnail.getAttribute('aria-pressed'),'true');
  assert.equal(await panel.locator('video').evaluate(v=>v.paused),true);
  console.log(`${model}: UI real 24/24 successful; thumbnail seek/pause passed`);
 }
 await page.getByLabel('モード',{exact:true}).selectOption('mock');
 assert.equal(await panel.locator('.detection').count(),0);
 await page.getByRole('button',{name:'解析する',exact:true}).click();
 await page.getByRole('status').filter({hasText:/完了：処理済み 24 \/ 24枚、.*失敗 0枚/}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('Mode separation and mock video: passed');
} finally {await browser.close();}
