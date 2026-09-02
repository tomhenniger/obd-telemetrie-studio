'use strict';
/* Rauchtest im echten Browser: Datei laden, jede Sektion öffnen, Konsolenfehler sammeln,
   Screenshots ablegen. Läuft nicht unter node --test (braucht Playwright + Server):
     PW_PATH=$(npm root -g)/playwright node test/smoke.js [csv-Pfad] [Basis-URL]
   Standard: data/demo.csv gegen http://127.0.0.1:8731/index.html, Bilder nach test/shots/. */
const path = require('path');
const fs = require('fs');
const pwPath = process.env.PW_PATH || 'playwright';
const { chromium } = require(pwPath);

const CSV = process.argv[2] || path.join(__dirname, '..', 'data', 'demo.csv');
const URL = process.argv[3] || 'http://127.0.0.1:8731/index.html';
const OUT = path.join(__dirname, 'shots');
const SECTIONS = ['overview', 'series', 'map', 'dist', 'fields', 'diag', 'akte', 'buy', 'ai', 'data', 'settings'];
const VIEWPORTS = { desktop: { width: 1400, height: 900 }, phone: { width: 390, height: 844 } };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  let failed = false;
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, locale: 'de-DE',
      isMobile: vpName === 'phone', hasTouch: vpName === 'phone' });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push(vpName + ': ' + m.text()); });
    page.on('pageerror', e => errors.push(vpName + ': ' + e.message));
    await page.goto(URL, { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.screenshot({ path: path.join(OUT, vpName + '-00-hero.png') });

    const csvText = fs.readFileSync(CSV, 'utf8');
    await page.evaluate(async ([name, text]) => {
      await ingest({ kind: 'file', file: new File([text], name, { type: 'text/csv' }) });
    }, [path.basename(CSV), csvText]);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, vpName + '-01-dialog.png') });
    // Fahrzeug im Dialog wählen, wenn er da ist
    await page.evaluate(() => {
      const s5 = profileById('audi_s5_b85_cgwc');
      if (s5) { store.set('profile', s5.id); App.profile = s5; }
      closeVehicleDialog(); recompute();
    });
    await page.waitForTimeout(300);

    for (const sec of SECTIONS) {
      const ok = await page.evaluate(async id => {
        const b = document.querySelector('[data-sec="' + id + '"]');
        if (!b) return 'kein Navigationselement';
        b.click();
        await new Promise(r => setTimeout(r, id === 'map' ? 1500 : id === 'akte' ? 900 : 500));
        const p = document.querySelector('#page-' + id);
        if (!p || p.hidden) return 'Seite nicht sichtbar';
        const crit = Array.from(p.querySelectorAll('.note.crit')).find(n => /konnte nicht aufgebaut/.test(n.textContent));
        if (crit) return crit.textContent.slice(0, 120);
        if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 2) return 'horizontal überlaufend (' + document.documentElement.scrollWidth + ' > ' + document.documentElement.clientWidth + ')';
        return 'ok';
      }, sec);
      const tag = ok === 'ok' ? 'ok ' : 'FEHLER';
      if (ok !== 'ok') failed = true;
      console.log(`${vpName.padEnd(7)} ${sec.padEnd(9)} ${tag} ${ok === 'ok' ? '' : ok}`);
      await page.screenshot({ path: path.join(OUT, `${vpName}-${sec}.png`), fullPage: vpName === 'phone' });
    }
    await ctx.close();
  }
  await browser.close();
  if (errors.length) { failed = true; console.log('\nKonsolenfehler:'); errors.slice(0, 20).forEach(e => console.log('  ' + e)); }
  console.log(failed ? '\nRAUCHTEST FEHLGESCHLAGEN' : '\nRauchtest bestanden, Bilder in test/shots/');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
