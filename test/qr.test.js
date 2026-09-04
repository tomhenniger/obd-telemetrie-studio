const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const ctx = load();
const g = name => ctx.get(name);

/* Referenz: die Norm-Beispiele lassen sich am Aufbau prüfen, ohne Fremdbibliothek */
test('Version und Kapazität wachsen mit der Länge', () => {
  const pick = g('qrPickVersion'), cap = g('qrCapacity');
  assert.equal(pick(10, 'L'), 1);
  assert.equal(cap(1, 'L'), 19);
  assert.equal(cap(1, 'H'), 9);
  assert.equal(cap(40, 'L'), 2956, 'Kapazität Version 40 L');
  assert.ok(pick(200, 'L') > 1 && pick(200, 'L') < 12, 'Version für 200 Bytes: ' + pick(200, 'L'));
  assert.ok(pick(2000, 'L') > 30);
  assert.equal(pick(99999, 'L'), 0, 'zu lang');
});

test('Reed-Solomon: bekannte Prüfbytes', () => {
  /* Beispiel aus der Norm (Version 1-M, "HELLO WORLD" alphanumerisch kodiert) */
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  const ec = Array.from(g('qrRsEncode')(Uint8Array.from(data), 10));
  assert.deepEqual(ec, [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('Matrix: Größe, Suchmuster, Taktmuster, dunkles Modul', () => {
  const q = g('qrEncode')('https://tomhenniger.github.io/obd-telemetrie-studio/', 'M');
  assert.equal(q.size, q.version * 4 + 17);
  const m = q.matrix, n = q.size;
  /* Suchmuster in drei Ecken: 7×7 mit Rahmen */
  const finderOk = (r0, c0) => m[r0][c0] === 1 && m[r0 + 1][c0 + 1] === 0 && m[r0 + 3][c0 + 3] === 1 && m[r0 + 6][c0 + 6] === 1;
  assert.ok(finderOk(0, 0) && finderOk(0, n - 7) && finderOk(n - 7, 0), 'Suchmuster');
  for (let i = 8; i < n - 8; i++) assert.equal(m[6][i], i % 2 === 0 ? 1 : 0, 'Taktmuster Zeile ' + i);
  assert.equal(m[n - 8][8], 1, 'dunkles Modul');
});

test('SVG: gültige Struktur, Ruhezone, Farben', () => {
  const svg = g('qrSvg')('Test 123', { px: 200, quiet: 4 });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+" width="200" height="200"/);
  const vb = /viewBox="0 0 (\d+) /.exec(svg)[1];
  const q = g('qrEncode')('Test 123', 'L');
  assert.equal(+vb, q.size + 8, 'Ruhezone von vier Modulen ringsum');
  assert.match(svg, /<path d="M[\d ]/);
  assert.match(svg, /fill="#000000"/);
  assert.ok(svg.length < 20000);
  assert.throws(() => g('qrSvg')('x'.repeat(3000)), /zu lang/);
});

test('Umlaute und lange Links überleben die Kodierung', () => {
  const long = 'https://tomhenniger.github.io/obd-telemetrie-studio/#s=' + 'A'.repeat(700);
  const q = g('qrEncode')(long, 'L');
  assert.ok(q.version >= 15, 'Version für langen Link: ' + q.version);
  assert.equal(q.bytes, long.length);
  const um = g('qrEncode')('Kühlmitteltemperatur größer 95 °C', 'M');
  assert.ok(um.bytes > 33, 'UTF-8 macht Umlaute länger: ' + um.bytes);
});

test('Codewortstrom gegen eine geprüfte Referenz (OpenCV-Encoder, Byte-Modus, Version 3 L)', () => {
  const text = 'https://tomhenniger.github.io/obd-telemetrie-studio/';
  const cw = g('qrEncodeData')(Array.from(new TextEncoder().encode(text)), 3, 'L');
  /* Diese Folge wurde Modul für Modul gegen den QR-Encoder von OpenCV geprüft:
     die erzeugte Matrix war bis auf die drei Füllbits am Ende identisch. */
  assert.equal(cw.join(','), [67,70,135,71,71,7,51,162,242,247,70,246,214,134,86,230,230,150,118,87,34,230,118,151,70,135,86,34,230,150,242,246,246,38,66,215,70,86,198,86,214,87,71,38,150,82,215,55,71,86,70,150,242,240,236,32,159,69,45,219,253,244,130,81,75,43,77,74,248,147].join(','));
});

test('Blockaufteilung folgt der Norm', () => {
  const L = g('qrBlockLayout');
  const l1 = L(1, 'L'); assert.equal(l1.numBlocks, 1); assert.equal(l1.ecLen, 7); assert.equal(l1.dataCw, 19);
  const l5q = L(5, 'Q'); assert.equal(l5q.numBlocks, 4); assert.equal(l5q.ecLen, 18); assert.equal(l5q.dataCw, 62);
  assert.equal(l5q.shortLen, 15); assert.equal(l5q.numLong, 2, 'zwei Blöcke sind ein Byte länger');
  const l25 = L(25, 'L'); assert.equal(l25.numBlocks, 12); assert.equal(l25.shortLen, 106); assert.equal(l25.numLong, 4);
  assert.equal(g('qrTotalCodewords')(40), 3706, 'Gesamtzahl Codewörter Version 40');
});
