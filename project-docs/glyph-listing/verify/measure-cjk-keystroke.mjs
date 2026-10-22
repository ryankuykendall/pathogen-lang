// W3 measurement: after Font.info() pulls every slice of a large CJK family,
// how long does each later compile take? Types into the editor and times
// compile → 'completed' via the store-driven status chip.
import puppeteer from 'puppeteer';
const variants = {
  info: `@font "Noto Sans SC";\nlet styles = #{ font-family: "Noto Sans SC"; font-size: 40; };\nlet info = Font.info(styles);\nlog("chars", info.characterCount);\ncircle(100, 100, 50);\n`,
  baseline: `@font "Noto Sans SC";\nlet styles = #{ font-family: "Noto Sans SC"; font-size: 40; };\ncircle(100, 100, 50);\n`,
};
const DEEP = `const deep = (sel, root = document) => { const f = root.querySelector(sel); if (f) return f; for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) { const r = deep(sel, el.shadowRoot); if (r) return r; } } return null; };`;
for (const [name, code] of Object.entries(variants)) {
  const browser = await puppeteer.launch({ headless: 'shell' });
  const page = await browser.newPage();
  page.on('dialog', (d) => d.dismiss());
  const state = Buffer.from(encodeURIComponent(JSON.stringify({ code }))).toString('base64');
  const t0 = Date.now();
  try { await page.goto(`http://localhost:3000/workspace/scratch?state=${state}`, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch {}
  const status = () => page.evaluate(`(() => { ${DEEP} return deep('#compilation-status')?.textContent || ''; })()`);
  const logs = () => page.evaluate(`(() => { ${DEEP} return (deep('console-pane')?.logs ?? []).map((l) => (l.parts ?? []).map((p) => p.value ?? '').join(' ')).join(' | '); })()`);
  for (let i = 0; i < 240; i++) { const l = await logs(); if (name === 'baseline' ? /Ready/.test(await status()) : /chars \d{4,}/.test(l)) break; await new Promise((r) => setTimeout(r, 250)); }
  const firstLoad = Date.now() - t0;
  console.log(`${name}: first load ${firstLoad} ms; logs: ${(await logs()).slice(0, 60)}`);
  // Edit: append a comment line, measure until the chip says Ready again.
  const times = [];
  for (let k = 0; k < 3; k++) {
    await page.evaluate(`(() => { ${DEEP} deep('.cm-content').focus(); })()`);
    await page.keyboard.press('End');
    const t = Date.now();
    await page.keyboard.type(' ');
    await new Promise((r) => setTimeout(r, 200));
    for (let i = 0; i < 400; i++) { if (/Ready/.test(await status())) break; await new Promise((r) => setTimeout(r, 25)); }
    times.push(Date.now() - t);
    await new Promise((r) => setTimeout(r, 1700));
  }
  console.log(`${name}: keystroke → Ready ${times.join(', ')} ms`);
  await browser.close();
}
