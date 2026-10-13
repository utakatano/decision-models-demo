// Explicitly authorized live checks: bundled fictional data and self-made video only.
import { createRequire } from 'node:module';
import { profiles, threads, CRITERIA_VERSION } from '../lib/fixtures.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
 const page = await browser.newPage();
 await page.goto('http://127.0.0.1:3001');
 const images = await page.evaluate(async () => {
  const video = document.createElement('video'); video.muted = true; video.src = '/samples/csv-import.webm';
  await new Promise((resolve,reject) => { video.onloadeddata=resolve; video.onerror=reject; });
  const canvas=document.createElement('canvas'); const ratio=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight)); canvas.width=Math.round(video.videoWidth*ratio);canvas.height=Math.round(video.videoHeight*ratio);
  const out=[];
  for(const time of [5,13,21]) { const sought=new Promise(resolve=>video.onseeked=resolve);video.currentTime=time;await sought;canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);out.push({time,image:canvas.toDataURL('image/jpeg',.85),duration:video.duration}); }
  video.pause();video.removeAttribute('src');video.load(); return out;
 });
 for(const model of ['jev','decisions','d1','clef']) {
  const video=model==='d1'||model==='clef';
  const inputs=video?images:[{profile:profiles[0],thread:threads[0]}];
  for(const value of inputs) {
   const body={kind:video?'video':'relevance',mode:'real',model,criteria:CRITERIA_VERSION,...value,...(video?{total:Math.ceil(value.duration),frameId:`frame-${value.time}`}:{})};
   const result=await page.evaluate(async body=>{const r=await fetch('/api/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};},body);
   console.log(JSON.stringify({model,time:value.time,...result}));
   if(result.status!==200)break;
  }
 }
} finally { await browser.close(); }
