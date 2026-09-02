'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, syntheticDrive } = require('./harness');
const c = load();

async function summaryFor(fileName, opts) {
  const csv = syntheticDrive(Object.assign({ duration: 600, dt: 0.5, speed: t => 60 + 20 * Math.sin(t / 50), coolant: () => 92 }, opts || {}));
  const ds = c.buildDataset(await c.parseCSV(csv, () => {}), { fuel: 'petrol' });
  const profile = c.profileById('audi_s5_b85_cgwc');
  const diag = c.runDiagnostics(ds, profile);
  const gears = c.computeGears(ds, 2.077, null, 7000);
  return c.driveSummary(ds, diag, gears, profile, fileName);
}

test('Datum aus dem Dateinamen', () => {
  const t = c.dateFromFileName('2026-08-30 11-19-42.csv');
  const d = new Date(t);
  assert.equal(d.getFullYear(), 2026); assert.equal(d.getMonth(), 7); assert.equal(d.getDate(), 30);
  assert.equal(d.getHours(), 11); assert.equal(d.getMinutes(), 19);
  assert.equal(c.dateFromFileName('fahrt.csv'), null);
});

test('Zusammenfassung ist klein, flach und trägt alle Befunde', async () => {
  const s = await summaryFor('2026-08-30 11-19-42.csv');
  assert.equal(s.v, 1);
  assert.ok(/^f_/.test(s.id));
  assert.equal(s.profileId, 'audi_s5_b85_cgwc');
  assert.ok(s.duration >= 599 && s.duration <= 601);
  assert.ok(s.diag.length >= 30);
  assert.ok(s.diag.every(d => ['ok', 'warn', 'crit', 'unklar', 'missing'].includes(d.status)));
  assert.ok(JSON.stringify(s).length < 20000, 'zu groß: ' + JSON.stringify(s).length);
  assert.ok(s.present.includes('rpm') && s.present.includes('coolant'));
});

test('dieselbe Datei ergibt dieselbe Kennung, eine andere nicht', async () => {
  const a = await summaryFor('2026-08-30 11-19-42.csv');
  const b = await summaryFor('2026-08-30 11-19-42.csv');
  const x = await summaryFor('2026-09-01 08-00-00.csv');
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, x.id);
});

test('Zusammenführen: jüngerer Stand gewinnt, Notizen bleiben', () => {
  const alt = { id: 'f_1', savedAt: 100, date: 1, diag: [], notes: 'meine Notiz' };
  const neu = { id: 'f_1', savedAt: 200, date: 1, diag: [{ id: 'x', status: 'ok' }], notes: '' };
  const r = c.akteMerge([alt], [neu, { id: 'f_2', savedAt: 50, date: 2, diag: [] }, { kaputt: true }]);
  assert.equal(r.added, 1); assert.equal(r.updated, 1);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows.find(x => x.id === 'f_1').notes, 'meine Notiz');
  assert.equal(r.rows.find(x => x.id === 'f_1').diag.length, 1);
});

test('Export/Import ist verlustfrei, fremde Dateien werden abgelehnt', async () => {
  const s = await summaryFor('2026-08-30 11-19-42.csv');
  const back = c.akteParseImport(c.akteExportJson([s]));
  assert.deepEqual(back[0], JSON.parse(JSON.stringify(s)));
  assert.throws(() => c.akteParseImport('{"foo":1}'), /keine Akte/);
});

test('Verlauf je Regel über mehrere Fahrten', async () => {
  const a = await summaryFor('2026-08-01 10-00-00.csv', { coolant: () => 90 });
  const b = await summaryFor('2026-08-15 10-00-00.csv', { coolant: () => 94 });
  const rules = c.akteTrendableRules([a, b]);
  assert.ok(rules.includes('coolant_operating'));
  const tr = c.akteTrend([a, b], 'coolant_operating');
  assert.equal(tr.length, 2);
  assert.ok(tr[0].date < tr[1].date);
  assert.equal(tr[0].value, 90); assert.equal(tr[1].value, 94);
});

test('ohne IndexedDB fällt die Ablage auf den Speicher zurück', async () => {
  const s = await summaryFor('2026-08-30 11-19-42.csv');
  await c.aktePut(s);
  const all = await c.akteAll();
  assert.equal(all.length, 1);
  await c.akteDelete(s.id);
  assert.equal((await c.akteAll()).length, 0);
});
