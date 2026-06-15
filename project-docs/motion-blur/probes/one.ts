import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
const f = process.argv[2];
const svg = readFileSync(`project-docs/motion-blur/probes/svgs/${f}.svg`,'utf8');
const page=`<!doctype html><body style="margin:0;background:#fff">${svg}</body>`;
(async()=>{const b=await puppeteer.launch({headless:'new' as unknown as boolean});const p=await b.newPage();await p.setViewport({width:200,height:200,deviceScaleFactor:3});await p.setContent(page,{waitUntil:'networkidle0'});await new Promise(r=>setTimeout(r,200));await p.screenshot({path:`project-docs/motion-blur/probes/one-${f}.png`});await b.close();console.log('ok '+f)})();
