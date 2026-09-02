'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, longCsv } = require('./harness');
const c = load();

async function dsFor(pid, unit, value) {
  const p = await c.parseCSV(longCsv([[1, pid, value, unit], [2, pid, value, unit], [3, pid, value, unit]]), () => {});
  return c.buildDataset(p, { fuel: 'petrol' });
}

test('hp wird nach PS umgerechnet, nicht umbenannt', async () => {
  const m = (await dsFor('Instant engine power (based on fuel consumption)', 'hp', 100)).metrics.get('power');
  assert.equal(m.unit, 'PS');
  assert.equal(m.converted, true);
  assert.equal(m.renamed, false);
  assert.ok(Math.abs(m.v[0] - 101.387) < 0.01, String(m.v[0]));
});

test('℃ ist °C – keine Umbenennung, keine Umrechnung', async () => {
  const m = (await dsFor('Engine coolant temperature', '℃', 90)).metrics.get('coolant');
  assert.equal(m.renamed, false);
  assert.equal(m.converted, false);
  assert.equal(m.v[0], 90);
});

test('Luftmasse in kg/h wird nach g/s umgerechnet', async () => {
  const m = (await dsFor('Mass air flow rate', 'kg/h', 36)).metrics.get('maf');
  assert.ok(m, 'maf fehlt');
  assert.ok(Math.abs(m.v[0] - 10) < 1e-9, String(m.v[0]));
});

test('°F wird mit Offset nach °C umgerechnet', async () => {
  const m = (await dsFor('Engine coolant temperature', '°F', 212)).metrics.get('coolant');
  assert.ok(Math.abs(m.v[0] - 100) < 1e-9);
});

test('psi-Ladedruck, der als bar deklariert ist, wird erkannt und korrigiert', async () => {
  const rows = [];
  for (let t = 0; t < 400; t++) {
    const load = 30 + (t % 40) * 4;
    rows.push([t, 'Absolute load value', load, '%']);
    rows.push([t, 'Calculated boost', (load * 0.06).toFixed(2), 'bar']);
  }
  const ds = c.buildDataset(await c.parseCSV(longCsv(rows), () => {}), { fuel: 'petrol' });
  assert.equal(ds.metrics.get('boost').unit, 'bar');
  assert.ok(ds.stats.boost.max < 1.0, 'nach Korrektur unter 1 bar, war: ' + ds.stats.boost.max);
  assert.equal(ds.boostDerived, true, 'linear aus der Last -> Rechenwert');
});
