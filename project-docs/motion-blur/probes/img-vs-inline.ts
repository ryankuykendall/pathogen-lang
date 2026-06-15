import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'node:fs';
const prog = readFileSync('project-docs/motion-blur/probes/svgs/solid-prog.svg','utf8');
// a linear sample as control
const lin = readFileSync('project-docs/motion-blur/probes/svgs/sq-90.svg','utf8');
const progUri = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(prog);
const linUri  = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(lin);
const page = `<!doctype html><body style="margin:0;background:#fff;display:flex;gap:8px">
  <div style="text-align:center;font:11px monospace">a) progressive INLINE<br><div style="width:200px;height:200px;border:1px solid #ccc">${prog}</div></div>
  <div style="text-align:center;font:11px monospace">b) progressive as &lt;img&gt;<br><img width="200" height="200" style="border:1px solid #ccc" src="${progUri}"></div>
  <div style="text-align:center;font:11px monospace">c) linear as &lt;img&gt; (control)<br><img width="200" height="200" style="border:1px solid #ccc" src="${linUri}"></div>
</body>`;
(async()=>{const b=await puppeteer.launch({headless:'new' as unknown as boolean});const p=await b.newPage();await p.setViewport({width:660,height:260,deviceScaleFactor:2});await p.setContent(page,{waitUntil:'networkidle0'});await new Promise(r=>setTimeout(r,400));await p.screenshot({path:'project-docs/motion-blur/probes/img-vs-inline.png'});await b.close();console.log('ok')})();
