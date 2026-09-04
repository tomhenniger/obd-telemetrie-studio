/* ===== VCDS-Messwertblöcke lesen ===================================
   VCDS (Ross-Tech) schreibt seine Logs in einem eigenen Format: ein
   Kopf mit Fahrzeugdaten, dann je Steuergerät Gruppenblöcke mit bis zu
   vier Kanälen, deren Namen und Einheiten über drei Zeilen verteilt
   stehen. Hier wird daraus eine Wide-CSV, die der normale Parser liest.

   Typischer Aufbau:
     Thursday,14,March,2024,19:02:31:12345
     VCDS Version: Release 22.3.0 (x64)
     Address 01: Engine       Labels: 06E-907-551-CGW.clb
     ,Group A: ,             Group B: ,            ...
     TIME ,STAMP ,Engine speed ,Mass air / rev ,...
      ,       ,/min ,mg/str ,...
     ,,,,
     0.0,STAMP,798,320.5,...
   ================================================================== */

function looksLikeVcds(text) {
  const head = String(text || '').slice(0, 4000);
  return /VCDS|VAG-COM/i.test(head) && /Group\s+[A-D]\s*:/i.test(head) || /Address\s+\d{2}:/i.test(head) && /TIME/i.test(head);
}

/* Liefert { text, channels, controller } als Wide-CSV mit Semikolon */
function vcdsToCsv(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const cut = l => l.split(',').map(s => s.trim());
  let controller = '';
  for (const l of lines.slice(0, 30)) {
    const m = /Address\s+(\d{2})\s*:\s*([^,]+)/i.exec(l);
    if (m) { controller = m[1] + ' ' + m[2].replace(/\s{2,}.*$/, '').replace(/Labels?:.*$/i, '').trim(); break; }
  }
  /* Kopfzeile finden: die Zeile, die mit TIME beginnt */
  let hi = -1;
  for (let i = 0; i < Math.min(lines.length, 60); i++) if (/^\s*TIME\b/i.test(lines[i])) { hi = i; break; }
  if (hi < 0) throw new Error('Keine TIME-Zeile gefunden – das sieht nicht nach einem VCDS-Log aus.');
  const names = cut(lines[hi]);
  const units = hi + 1 < lines.length ? cut(lines[hi + 1]) : [];
  /* Erste Datenzeile: die erste Zeile nach dem Kopf, deren erste Zelle eine Zahl ist */
  let di = hi + 1;
  while (di < lines.length && !/^\s*-?\d+([.,]\d+)?\s*(,|$)/.test(lines[di])) di++;
  if (di >= lines.length) throw new Error('Im VCDS-Log stehen keine Messzeilen.');

  /* Spalten zusammensetzen: Name + Einheit, leere und STAMP-Spalten verwerfen */
  const cols = [], keep = [];
  for (let c = 0; c < names.length; c++) {
    const nm = (names[c] || '').trim();
    const un = (units[c] || '').trim();
    if (!nm && !un) continue;
    if (/^stamp$/i.test(nm)) continue;
    if (/^time$/i.test(nm)) { cols.push('SECONDS'); keep.push(c); continue; }
    if (!nm) continue;
    cols.push(un ? nm + ' (' + un + ')' : nm);
    keep.push(c);
  }
  if (cols.length < 2) throw new Error('Im VCDS-Log ließen sich keine Messkanäle zuordnen.');

  const out = [cols.map(c => '"' + c.replace(/"/g, "'") + '"').join(';')];
  let rows = 0;
  for (let i = di; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    if (/^\s*(TIME|Address|VCDS|Group)/i.test(l)) continue;      // weiterer Blockkopf mitten in der Datei
    const f = cut(l);
    if (!/^-?\d+([.,]\d+)?$/.test((f[0] || '').trim())) continue;
    const vals = keep.map(c => {
      const v = (f[c] || '').trim().replace(',', '.');
      return /^-?\d+(\.\d+)?$/.test(v) ? v : '';
    });
    if (vals.filter(v => v !== '').length < 2) continue;
    out.push(vals.join(';'));
    rows++;
  }
  if (!rows) throw new Error('Im VCDS-Log standen keine auswertbaren Messzeilen.');
  return { text: out.join('\n') + '\n', channels: cols.slice(1), controller, rows };
}
