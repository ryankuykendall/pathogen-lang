import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
const D='project-docs/motion-blur/probes/svgs';
const o:[string,string][]=[['ghost-before','BEFORE (ghosty, samples=18)'],['ghost-after','AFTER (smoothed, samples=18)'],['ghost-after28','AFTER (samples=28)']];
const panels=o.map(([f,l])=>`<figure style="margin:0;text-align:center;font:12px monospace"><div style="border:1px solid #ccc;background:#eef3f7;width:300px">${readFileSync(D+'/'+f+'.svg','utf8').replace(/width="\d+"/,'width="300"').replace(/height="\d+"/,'height="180"')}</div><figcaption>${l}</figcaption></figure>`).join('');
const page=`<!doctype html><body style="margin:16px;background:#ddd"><div style="display:grid;grid-template-columns:repeat(3,auto);gap:14px">${panels}</div></body>`;
(async()=>{const b=await puppeteer.launch({headless:'new' as unknown as boolean});const p=await b.newPage();await p.setViewport({width:1000,height:260,deviceScaleFactor:2});await p.setContent(page,{waitUntil:'networkidle0'});await new Promise(r=>setTimeout(r,300));await p.screenshot({path:'project-docs/motion-blur/probes/tile-ghost.png'});await b.close();console.log('ok')})();
