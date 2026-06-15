import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
const D='project-docs/motion-blur/probes/svgs';
const o:[string,string][]=[['ghost-before','BEFORE (isotropic/none)'],['dir0','directional, 0deg'],['dir45','directional, 45deg'],['dir90','directional, 90deg']];
const panels=o.map(([f,l])=>`<figure style="margin:0;text-align:center;font:12px monospace"><div style="border:1px solid #ccc;background:#eef3f7;width:280px">${readFileSync(D+'/'+f+'.svg','utf8').replace(/width="\d+"/,'width="280"').replace(/height="\d+"/,'height="168"')}</div><figcaption>${l}</figcaption></figure>`).join('');
const page=`<!doctype html><body style="margin:14px;background:#ddd"><div style="display:grid;grid-template-columns:repeat(2,auto);gap:12px">${panels}</div></body>`;
(async()=>{const b=await puppeteer.launch({headless:'new' as unknown as boolean});const p=await b.newPage();await p.setViewport({width:620,height:440,deviceScaleFactor:2});await p.setContent(page,{waitUntil:'networkidle0'});await new Promise(r=>setTimeout(r,300));await p.screenshot({path:'project-docs/motion-blur/probes/tile-dir.png'});await b.close();console.log('ok')})();
