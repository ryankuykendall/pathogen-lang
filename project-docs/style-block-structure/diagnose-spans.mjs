// Span-level recolor diagnosis across environment variations.
// Usage: node diagnose-spans.mjs [chromePath]
import puppeteer from 'puppeteer';
import * as fs from 'fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WORKSPACE_URL = "http://localhost:3000/workspace/scratch?state=JTdCJTIyY29kZSUyMiUzQSUyMmRlZmluZSUyMFZpZXdCb3goMCUyQyUyMDAlMkMlMjA4MDAlMkMlMjAyMDApJTNCJTVDbmxldCUyMG1haW5QTEZpbGxDb2xvciUyMCUzRCUyMG9rbGNoKDAuOTc5MiUyMDAuMTAzNSUyMDEwNy42JTIwJTJGJTIwMC4xKSUzQiU1Q25sZXQlMjBzaGFkb3dDb2xvciUyMCUzRCUyMG9rbGNoKDAuNjU2NyUyMDAuMjU5OCUyMDM1Ni44KSUzQiU1Q25sZXQlMjBiYXNlTWFpblN0eWxlcyUyMCUzRCUyMCUyNCU3QiU1Q24lMjAlMjBmaWxsJTNBJTIwbWFpblBMRmlsbENvbG9yJTNCJTVDbiUyMCUyMHN0cm9rZSUzQSUyMG1haW5QTEZpbGxDb2xvci5kYXJrZW4oNjQlMjUpLmFscGhhKDUwJTI1KSUzQiU1Q24lMjAlMjBzdHJva2Utd2lkdGglM0ElMjAwLjElM0IlNUNuJTIwJTIwZmlsdGVyJTNBJTIwZHJvcC1zaGFkb3coNHB4JTJDJTIwNHB4JTJDJTIwNHB4JTJDJTIwc2hhZG93Q29sb3IpJTNCJTVDbiU3RCUzQiU1Q25sZXQlMjBtYWluUGF0aExheWVyJTIwJTNEJTIwUGF0aExheWVyKCdtYWluLXBhdGgtbGF5ZXInKSUyMCUzQyUzQyUyMGJhc2VNYWluU3R5bGVzJTNCJTVDbiU1Q25sZXQlMjBnbHlwaExheWVyU3R5bGVzJTIwJTNEJTIwJTI0JTdCJTVDbiUyMCUyMGZpbGwlM0ElMjAlMjNlYWFhJTNCJTVDbiUyMCUyMHN0cm9rZSUzQSUyMCUyMzY2N2ElM0IlNUNuJTIwJTIwc3Ryb2tlLXdpZHRoJTNBJTIwMC4xJTNCJTVDbiU3RCUzQiU1Q24lNUNubGV0JTIwZm9udEZhbWlseSUyMCUzRCUyMCdOb3RvJTIwU2FucyclM0IlNUNuJTQwZm9udCUyMGZvbnRGYW1pbHklM0IlNUNuJTJGJTJGJTIwJTQwZm9udCUyMGZvbnRGYW1pbHklM0IlNUNubGV0JTIwZm9udFN0eWxlcyUyMCUzRCUyMCUyNCU3QiU1Q24lMjAlMjBmaWxsJTNBJTIwJTIzY2NjYzAwNjYlM0IlNUNuJTIwJTIwZm9udC1mYW1pbHklM0ElMjBmb250RmFtaWx5JTNCJTVDbiUyMCUyMGZvbnQtc2l6ZSUzQSUyMDMyJTNCJTVDbiUyMCUyMGZvbnQtd2VpZ2h0JTNBJTIwNDAwJTNCJTVDbiUyMCUyMHN0cm9rZSUzQSUyMCUyM2NjMCUzQiU1Q24lMjAlMjBzdHJva2Utd2lkdGglM0ElMjAwLjI1JTNCJTVDbiU3RCUzQiU1Q24lNUNubGV0JTIwbGF5ZXJDb3VudGVyJTIwJTNEJTIwMSUzQiU1Q25sZXQlMjBnbHlwaHMlMjAlM0QlMjBQYXRoQmxvY2suZnJvbUdseXBoKCdGSVhFRF9CRUFSISEhJyUyQyUyMGZvbnRTdHlsZXMpJTNCJTVDbmZvciUyMCglNUJnbHlwaCUyQyUyMGdJbmRleCU1RCUyMGluJTIwZ2x5cGhzKSUyMCU3QiU1Q24lMjAlMjBmb3IlMjAoJTVCY29udG91ciUyQyUyMGNJbmRleCU1RCUyMGluJTIwZ2x5cGguY29udG91cnMubWFwKCklMjAlN0IlN0Njb24lN0MlNUNuJTIwJTIwJTIwJTIwcmV0dXJuJTIwY29uLmZpbGxldCgxLjYpJTNCJTVDbiUyMCUyMCU3RCklMjAlN0IlNUNuJTIwJTIwJTIwJTIwbGV0JTIwbGVmdE9mZnNldCUyMCUzRCUyMGNhbGMoMTI2LjUlMjAlMkIlMjBnSW5kZXglMjAqJTIwNDgpJTNCJTVDbiU1Q24lMjAlMjAlMjAlMjBmb3IlMjAob2Zmc2V0QmFzZSUyMGluJTIwMS4uMjApJTIwJTdCJTVDbiUyMCUyMCUyMCUyMCUyMCUyMGxldCUyMG9mZnNldEJhc2UlMjAlM0QlMjBjYWxjKG9mZnNldEJhc2UlMjAqJTIwMS41JTIwJTJCJTIwNSklM0IlNUNuJTIwJTIwJTIwJTIwJTIwJTIwbGV0JTIwaGFsbyUyMCUzRCUyMGNvbnRvdXIudmFyaWFibGVPZmZzZXQoKSUyMCU3QiU3Q3ZvJTJDJTIwY3BiJTdDJTVDbiUyMCUyMCUyMCUyMCUyMCUyMCUyMCUyMGxldCUyMHRpbWVNYXglMjAlM0QlMjA5JTNCJTVDbiUyMCUyMCUyMCUyMCUyMCUyMCUyMCUyMGZvciUyMCh0aW1lJTIwaW4lMjAxLi50aW1lTWF4KSUyMCU3QiU1Q24lMjAlMjAlMjAlMjAlMjAlMjAlMjAlMjAlMjAlMjBsZXQlMjBvZmZzZXQlMjAlM0QlMjByYW5kb21SYW5nZShjYWxjKG9mZnNldEJhc2UlMjAtJTIwMS41KSUyQyUyMGNhbGMob2Zmc2V0QmFzZSUyMCUyQiUyMDEuNSkpJTNCJTVDbiUyMCUyMCUyMCUyMCUyMCUyMCUyMCUyMCUyMCUyMHZvLnN0b3AoY2FsYyh0aW1lJTIwJTJGJTIwdGltZU1heCklMkMlMjBvZmZzZXQlMkMlMjBDdXJ2ZUNvbnRpbnVpdHkuRzIpJTNCJTVDbiUyMCUyMCUyMCUyMCUyMCUyMCUyMCUyMCU3RCU1Q24lMjAlMjAlMjAlMjAlMjAlMjAlN0QlM0IlNUNuJTIwJTIwJTIwJTIwJTIwJTIwbGV0JTIwbGF5ZXJPcGFjaXR5JTIwJTNEJTIwMC4xJTI1JTNCJTIwJTJGJTJGJTIwY2FsYygxJTIwJTJGJTIwb2Zmc2V0QmFzZSUyMColMjA0KSUzQiU1Q24lMjAlMjAlMjAlMjAlMjAlMjBsZXQlMjBwbCUyMCUzRCUyMFBhdGhMYXllciglNjBwbC0lMjQlN0JsYXllckNvdW50ZXIlN0QlNjApJTIwJTNDJTNDJTIwYmFzZU1haW5TdHlsZXMlM0IlNUNuJTIwJTIwJTIwJTIwJTIwJTIwbGF5ZXJDb3VudGVyJTIwJTNEJTIwbGF5ZXJDb3VudGVyJTIwJTJCJTIwMSUzQiU1Q24lMjAlMjAlMjAlMjAlMjAlMjBwbC5hcHBseSUyMCU3QiU1Q24lMjAlMjAlMjAlMjAlMjAlMjAlMjAlMjBoYWxvLmRyYXdUbyhsZWZ0T2Zmc2V0JTJDJTIwMTAxKSUzQiU1Q24lMjAlMjAlMjAlMjAlMjAlMjAlMjAlMjB6JTVDbiUyMCUyMCUyMCUyMCUyMCUyMCU3RCU1Q24lMjAlMjAlMjAlMjAlN0QlNUNuJTVDbiUyMCUyMCUyMCUyMGxldCUyMGdseXBoTGF5ZXIlMjAlM0QlMjBQYXRoTGF5ZXIoJTYwZ2wtJTI0JTdCbGF5ZXJDb3VudGVyJTdEJTYwKSUyMCUzQyUzQyUyMGdseXBoTGF5ZXJTdHlsZXMlM0IlNUNuJTIwJTIwJTIwJTIwZ2x5cGhMYXllci5hcHBseSUyMCU3QiU1Q24lMjAlMjAlMjAlMjAlMjAlMjBjb250b3VyLmZpbGxldCgxLjYpLmRyYXdUbyhsZWZ0T2Zmc2V0JTJDJTIwMTAyKSUzQiU1Q24lMjAlMjAlMjAlMjAlN0QlNUNuJTIwJTIwJTdEJTVDbiU3RCU1Q24lNUNuJTVDbmxldCUyMCU1Qm51bSUyQyUyMHBiJTJDJTIwc2IlNUQlMjAlM0QlMjAlNUIlNUNuJTIwJTIwNSUyQyU1Q24lMjAlMjAlNDAlN0IlNUNuJTVDbiUyMCUyMCU3RCUyQyU1Q24lMjAlMjAlMjQlN0IlN0QlMkMlNUNuJTVEJTNCJTVDbmxldCUyMGJhciUyMCUzRCUyMG51bSUyMCUyQiUyMDEyJTNCJTNCJTVDbiUyMiU3RA%3D%3D";

const SPAN_DIAG = () => {
  const pane = document.querySelector('app-shell').shadowRoot
    .querySelector('workspace-view').shadowRoot
    .querySelector('code-editor-pane');
  const spans = [...pane.shadowRoot.querySelectorAll('.cm-style-var-ref')];
  const root = pane.shadowRoot.querySelector('.cm-editor');
  return {
    editorClasses: root?.className ?? '(none)',
    spans: spans.map((s) => ({
      text: s.textContent,
      color: getComputedStyle(s).color,
      cls: s.className,
      nested: s.querySelectorAll('span').length,
    })),
  };
};

async function run(label, { chromePath, storedTheme, emulateDark, userId }) {
  const browser = await puppeteer.launch({
    headless: 'new',
    ...(chromePath ? { executablePath: chromePath } : {}),
  });
  try {
    const page = await browser.newPage();
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' || /crash/i.test(m.text())) errors.push(m.text().slice(0, 150)); });
    if (emulateDark) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await page.evaluateOnNewDocument((theme, uid) => {
      try {
        if (theme) localStorage.setItem('pathogen-theme', theme);
        if (uid) localStorage.setItem('pathogen-lang:userId', uid);
      } catch {}
    }, storedTheme, userId);
    await page.goto(WORKSPACE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(4000);
    const res = await page.evaluate(SPAN_DIAG);
    console.log(`\n=== ${label} ===`);
    console.log('editor classes:', res.editorClasses);
    for (const s of res.spans) {
      console.log(`  "${s.text}" → ${s.color} | nested spans: ${s.nested} | cls: ${s.cls}`);
    }
    if (errors.length) console.log('console errors:', errors.slice(0, 4));
  } finally {
    await browser.close();
  }
}

const userId = fs.existsSync('/tmp/repro-userid.txt') ? fs.readFileSync('/tmp/repro-userid.txt', 'utf8').trim() : null;
await run('bundled Chromium, stored dark theme', { storedTheme: 'dark', userId });
await run('bundled Chromium, SYSTEM dark (no stored theme)', { emulateDark: true, userId });
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (fs.existsSync(systemChrome) || process.argv[2]) {
  await run('system Chrome, stored dark theme', { chromePath: process.argv[2] ?? systemChrome, storedTheme: 'dark', userId });
}
