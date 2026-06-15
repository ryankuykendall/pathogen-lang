import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'node:fs';
const svgs = 'project-docs/motion-blur/probes/svgs';
const order: [string,string][] = [['sq-ref','reference'],['sq-0','linear 0deg'],['sq-45','linear 45deg'],['sq-90','linear 90deg']];
const panels = order.map(([f,l])=>`<figure style="margin:0;text-align:center;font:12px monospace"><div style="width:200px;height:200px;border:1px solid #ccc;background:#fff">${readFileSync(svgs+'/'+f+'.svg','utf8')}</div><figcaption>${l}</figcaption></figure>`).join('');
const page=`<!doctype html><body style="margin:16px;background:#eee"><div style="display:grid;grid-template-columns:repeat(4,200px);gap:14px">${panels}</div></body>`;
(async()=>{const b=await puppeteer.launch({headless:'new' as unknown as boolean});const p=await b.newPage();await p.setViewport({width:900,height:280,deviceScaleFactor:2});await p.setContent(page,{waitUntil:'networkidle0'});await new Promise(r=>setTimeout(r,200));await p.screenshot({path:'project-docs/motion-blur/probes/tile-sq.png'});await b.close();console.log('ok')})();
