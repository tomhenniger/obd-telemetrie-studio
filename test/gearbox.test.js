'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const c = load();
const GB = c.get('GEARBOXES');
const C = 2.077;

test('Katalog: jede Übersetzung positiv, Gangzahl passt, Konfidenz und Quelle vorhanden', () => {
  assert.ok(GB.length >= 30);
  for (const g of GB) {
    assert.equal(g.ratios.length, g.gears, g.id);
    assert.ok(g.ratios.every(r => r > 0.3 && r < 7), g.id);
    assert.ok(g.quelle && g.confidence, g.id + ' ohne Quelle/Konfidenz');
    if (g.final2) assert.ok(Array.isArray(g.final2Gears) && g.final2Gears.length, g.id + ' final2 ohne Gänge');
  }
});

test('Achsantrieb aus vollständiger Messung exakt rekonstruiert', () => {
  const zf = GB.find(g => g.id === 'zf_8hp45');
  const meas = zf.ratios.slice(1).map(r => 60 * C / (r * 3.08)).sort((a, b) => a - b);
  const fit = c.fitFinalDrive(meas, zf.ratios, C);
  assert.ok(Math.abs(fit.final - 3.08) < 1e-6);
  assert.deepEqual(fit.idx.map(i => i + 1), [2, 3, 4, 5, 6, 7, 8]);
  assert.ok(fit.worst < 1e-9);
});

test('Achsantrieb aus vier verrauschten mittleren Gängen', () => {
  const zf = GB.find(g => g.id === 'zf_8hp45');
  let sd = 1; const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff - 0.5; };
  const meas = [2, 3, 4, 5].map(i => 60 * C / (zf.ratios[i] * 3.08) * (1 + rnd() * 0.008)).sort((a, b) => a - b);
  const fit = c.fitFinalDrive(meas, zf.ratios, C);
  assert.ok(Math.abs(fit.final - 3.08) / 3.08 < 0.01, String(fit.final));
  assert.deepEqual(fit.idx.map(i => i + 1), [3, 4, 5, 6]);
  assert.ok(fit.worst < 0.01);
});

test('falsches Getriebe wird über die Abweichung verworfen', () => {
  const six = GB.find(g => g.id === 'zf_6hp'), eight = GB.find(g => g.id === 'zf_8hp45');
  const meas = six.ratios.map(r => 60 * C / (r * 3.46)).sort((a, b) => a - b);
  assert.ok(c.fitFinalDrive(meas, eight.ratios, C).worst > 0.05);
});

test('DL501: S5-Messung wird als Gänge 2–7 erkannt, Gang 1 fehlt', () => {
  const dl = GB.find(g => g.id === 'vag_dl501_s4_s5');
  const meas = [14.5, 22.0, 30.4, 39.6, 49.5, 60.3];
  const table = c.gearboxTable(Object.assign({}, dl), 2.010);
  const mt = c.matchGearsToTable(meas, table);
  assert.ok(mt.ok, 'Zuordnung muss passen, Abweichung ' + mt.worst);
  assert.deepEqual(mt.idx.map(i => table[i].gear), [2, 3, 4, 5, 6, 7]);
  assert.ok(mt.worst < 0.012);
});

test('Vorschlag: CVT ausgeschlossen, Fahrzeugtreffer vorn, Urteil hängt am Treffer', () => {
  const meas = [14.5, 22.0, 30.4, 39.6, 49.5, 60.3];
  const sug = c.suggestGearboxes(meas, 2.010, 5, c.profileById('audi_s5_b85_cgwc'));
  assert.ok(sug.length);
  assert.ok(sug.every(h => h.gb.kind !== 'cvt'));
  assert.equal(sug[0].gb.kennung, 'DL501 (0B5)');
  assert.equal(sug[0].affinity, 2);
  assert.equal(sug[0].verdict.clear, true);
});

test('Gangzahl-Modus: mehr gemessene Stufen als Gänge ist ein Widerspruch', () => {
  const res = { gears: [14.5, 22, 30.4, 39.6, 49.5, 60.3].map((k, i) => ({ idx: i, k: 1000 / k, kmhPer1000: k })) };
  const info = c.labelGears(res, { kind: 'count', gears: 4, firstGear: null, label: '4-Gang' }, 6500);
  assert.equal(info.mode, 'too-many');
  assert.ok(res.gears.every(g => /^S\d$/.test(g.label)));
});
