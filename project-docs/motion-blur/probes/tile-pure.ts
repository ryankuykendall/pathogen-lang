import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
const pure=readFileSync('/tmp/puregauss.svg','utf8');
const tap=readFileSync('project-docs/motion-blur/probes/svgs/dir0.svg','utf8').replace(/width="\d+"/,'width="280"').replace(/height="\d+"/,'height="168"');
const page=`<!doctype html><body style="margin:14px;background:#ddd;display:flex;gap:14px;font:12px monospace">
  <figure style="margin:0;text-align:center"><div style="border:1px solid #ccc">${tap}</div>multi-tap (current)</figure>
  <figure style="margin:0;text-align:center"><div style="border:1px solid #ccc">${pure}</div>pure 2-value gaussian "15 0"</figure>
</body>`;
(async()=>{const b=await puppeteer.launch({headless:'new' as unknown as boolean});const p=await b.newPage();await p.setViewport({width:640,height:230,deviceScaleFactor:2});await p.setContent(page,{waitUntil:'networkidle0'});await new Promise(r=>setTimeout(r,300));await p.screenshot({path:'project-docs/motion-blur/probes/tile-pure.png'});await b.close();console.log('ok')})();
