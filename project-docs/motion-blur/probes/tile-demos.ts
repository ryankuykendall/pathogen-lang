import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
const D='project-docs/motion-blur/probes/svgs';
const order=['01-linear-pan','02-linear-angle-sweep','03-progressive-frosted','04-progressive-directions','05-motion-vs-native-blur'];
const panels=order.map(f=>`<figure style="margin:0;text-align:center;font:11px monospace"><div style="border:1px solid #ccc;background:#fff;display:inline-block">${readFileSync(D+'/demo-'+f+'.svg','utf8')}</div><figcaption>${f}</figcaption></figure>`).join('');
const page=`<!doctype html><body style="margin:16px;background:#eee"><div style="display:grid;grid-template-columns:repeat(2,auto);gap:18px;justify-items:center">${panels}</div></body>`;
(async()=>{const b=await puppeteer.launch({headless:'new' as unknown as boolean});const p=await b.newPage();await p.setViewport({width:680,height:760,deviceScaleFactor:2});await p.setContent(page,{waitUntil:'networkidle0'});await new Promise(r=>setTimeout(r,300));await p.screenshot({path:'project-docs/motion-blur/probes/tile-demos.png'});await b.close();console.log('ok')})();
