import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
const f=process.argv[2];
const svg=readFileSync('project-docs/motion-blur/probes/svgs/'+f+'.svg','utf8');
(async()=>{const b=await puppeteer.launch({headless:'new' as unknown as boolean});const p=await b.newPage();await p.setViewport({width:400,height:240,deviceScaleFactor:3});await p.setContent('<!doctype html><body style="margin:0;background:#eef3f7">'+svg.replace(/width="\d+"/,'width="400"').replace(/height="\d+"/,'height="240"')+'</body>',{waitUntil:'networkidle0'});await new Promise(r=>setTimeout(r,250));await p.screenshot({path:'project-docs/motion-blur/probes/one2-'+f+'.png'});await b.close();console.log('ok')})();
