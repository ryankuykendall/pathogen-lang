// Measure progressive-blur interior luminance down the shape centerline.
// feImage filters only resolve when the SVG is INLINE (not <img>), so we render
// inline, screenshot to PNG at 1×, then decode that PNG (PNGs load fine as img)
// and sample. On a white bg, an alpha dip reads as higher luminance (toward 255).
// Run: npx tsx project-docs/motion-blur/probes/measure-alpha.ts
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(join(here, 'svgs/solid-prog.svg'), 'utf8'); // fixed-crossfade CLI output

async function main(): Promise<void> {
  const browser = await puppeteer.launch({ headless: 'new' as unknown as boolean });
  try {
    const p = await browser.newPage();
    await p.setViewport({ width: 200, height: 200, deviceScaleFactor: 1 });
    await p.setContent(
      `<!doctype html><body style="margin:0;background:#fff">${svg.replace(/width="\d+"/, 'width="200"').replace(/height="\d+"/, 'height="200"')}</body>`,
      { waitUntil: 'networkidle0' },
    );
    const png = (await p.screenshot({ clip: { x: 0, y: 0, width: 200, height: 200 } })) as Buffer;

    // Decode the PNG via canvas, sample the interior centerline x=100, y=40..160.
    const p2 = await browser.newPage();
    await p2.setContent('<!doctype html><body></body>', { waitUntil: 'networkidle0' });
    const dataUri = 'data:image/png;base64,' + png.toString('base64');
    const script = `(async function(){
      var img = new Image();
      await new Promise(function(res,rej){ img.onload=res; img.onerror=rej; img.src=${JSON.stringify(dataUri)}; });
      var c=document.createElement('canvas'); c.width=200; c.height=200;
      var ctx=c.getContext('2d'); ctx.drawImage(img,0,0);
      var out=[];
      for (var y=40;y<=160;y+=10){ var d=ctx.getImageData(100,y,1,1).data;
        out.push({y:y,r:d[0],g:d[1],b:d[2],lum:Math.round(0.2126*d[0]+0.7152*d[1]+0.0722*d[2])}); }
      return out;
    })()`;
    const samples = (await p2.evaluate(script)) as Array<Record<string, number>>;
    console.log(' y   rgb            lum  (shape interior; lower lum = more solid red)');
    for (const s of samples) {
      console.log(`${String(s.y).padStart(3)}  (${String(s.r).padStart(3)},${String(s.g).padStart(3)},${String(s.b).padStart(3)})  ${s.lum}`);
    }
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
