// Storybook check for the log-entry "Warning Group" story (added 2026-09-05):
// the row renders a ×N chip with an accessible label, and clicking it lists
// the instances. Run against the dev site: node storybook-log-entry-e2e.mjs
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss());
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
await page.goto('http://localhost:3000/storybook/log-entry', { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise((r) => setTimeout(r, 4000));
const WALK = `const walk = (root, sel, out) => { for (const el of root.querySelectorAll('*')) { if (el.matches(sel)) out.push(el); if (el.shadowRoot) walk(el.shadowRoot, sel, out); } return out; };`;
const picked = await page.evaluate(`(() => { ${WALK}
  const clickable = walk(document, 'button, a, li, option, [role=tab]', []).filter((el) => (el.textContent || '').trim() === 'Warning Group');
  clickable[0]?.click();
  return { storyButtons: clickable.length };
})()`);
await new Promise((r) => setTimeout(r, 1500));
const after = await page.evaluate(`(() => { ${WALK}
  const entries = walk(document, 'log-entry', []);
  const chips = entries.map((e) => e.shadowRoot?.querySelector('.count')?.textContent ?? null);
  const chip = entries.map((e) => e.shadowRoot?.querySelector('.count')).find(Boolean);
  chip?.click();
  const instances = entries.map((e) => e.shadowRoot?.querySelectorAll('.instance').length ?? 0);
  return { entries: entries.length, chips, instances, label: chip?.getAttribute('aria-label') ?? null };
})()`);
console.log(JSON.stringify({ ...picked, ...after, errors }));
await browser.close();
