import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
const prog = readFileSync('project-docs/motion-blur/probes/svgs/solid-prog.svg','utf8');
const lin  = readFileSync('project-docs/motion-blur/probes/svgs/sq-90.svg','utf8');
(async()=>{
  const b=await puppeteer.launch({headless:'new' as unknown as boolean});
  const p=await b.newPage();
  await p.setContent('<!doctype html><body></body>',{waitUntil:'networkidle0'});
  const script = `(async function(svg,sx,sy){
    var url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
    var img=new Image();
    await new Promise(function(res,rej){img.onload=res;img.onerror=function(){rej(new Error('img err'))};img.src=url;});
    var c=document.createElement('canvas');c.width=200;c.height=200;
    var ctx=c.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,200,200);   // white bg like a real thumbnail
    ctx.drawImage(img,0,0);
    var d=ctx.getImageData(sx,sy,1,1).data;
    return {r:d[0],g:d[1],b:d[2],a:d[3]};
  })`;
  // sample the shape interior: progressive rect(55,30,90,140) center ~ (100,100); linear sq center (100,100)
  const progPx = await p.evaluate(script + `(${JSON.stringify(prog)},100,80)`);
  const linPx  = await p.evaluate(script + `(${JSON.stringify(lin)},100,100)`);
  console.log('canvas interior pixel  progressive='+JSON.stringify(progPx)+'  linear='+JSON.stringify(linPx));
  console.log('(white=255,255,255 means BLANK/feImage-failed; red means rendered)');
  await b.close();
})().catch(e=>{console.error(String(e));process.exit(1)});
