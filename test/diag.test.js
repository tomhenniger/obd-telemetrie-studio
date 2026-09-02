'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, longCsv, syntheticDrive } = require('./harness');
const c = load();
async function diag(csv, profileId) {
  const ds = c.buildDataset(await c.parseCSV(csv, () => {}), { fuel: 'petrol' });
  return { ds, res: c.runDiagnostics(ds, c.profileById(profileId || 'audi_s5_b85_cgwc')).results };
}
const find = (r, id) => r.find(x => x.id === id);

test('Warmlauf: 7 Sekunden Kühlmitteldaten ergeben keinen Thermostat-Alarm', async () => {
  const rows = [];
  for (let t = 0; t < 7; t++) rows.push([t, 'Engine coolant temperature', 21, '℃']);
  for (let t = 0; t < 40; t++) rows.push([t, 'Engine RPM', 800, 'rpm']);
  for (let t = 0; t < 600; t++) rows.push([t, 'Vehicle speed', t < 40 ? 0 : 60, 'km/h']);
  const f = find((await diag(longCsv(rows))).res, 'coolant_warmup');
  assert.equal(f.status, 'unklar');
});

test('Warmlauf: Schwelle wächst mit dem Temperaturhub', async () => {
  const csv = syntheticDrive({ duration: 900, dt: 1, speed: () => 60, coolant: t => Math.min(93, 33 + t * (52 / 400)) });
  const f = find((await diag(csv)).res, 'coolant_warmup');
  assert.equal(f.status, 'ok', 'ab 33 °C sind 6:40 min unauffällig, war: ' + f.status + ' ' + f.ref);
});

test('Volllast wird am Fahrpedal erkannt, nicht an der Last selbst', async () => {
  const csv = syntheticDrive({ duration: 300, dt: 0.5, speed: t => 50 + 40 * Math.sin(t / 30),
    rpm: (t, v) => 1500 + v * 30, load: (t, v) => (t > 100 && t < 110) ? 120 : 45, coolant: () => 92,
    extra: (t) => [['Absolute pedal position D', (t > 100 && t < 110) ? 67 : 15, '%']] });
  const f = find((await diag(csv)).res, 'load_wot');
  assert.ok(f.status === 'warn' || f.status === 'crit', 'gedeckelte Last muss auffallen, war: ' + f.status);
  assert.ok(/Fahrpedal/.test(f.cond || ''));
});

test('Benziner ohne Zündwinkel-PID wird nicht zum Diesel', async () => {
  const csv = syntheticDrive({ duration: 300, dt: 0.5, speed: () => 60, extra: () => [['Long term fuel % trim - Bank 1', 3.1, '%']] });
  const ds = c.buildDataset(await c.parseCSV(csv, () => {}), { fuel: 'petrol' });
  assert.notEqual(c.autoProfile(ds), 'generic_diesel');
});

test('Untertemperatur ist ein Befund, keine Datenlücke', async () => {
  const csv = syntheticDrive({ duration: 1200, dt: 1, speed: () => 60, coolant: () => 72 });
  const f = find((await diag(csv)).res, 'coolant_operating');
  assert.ok(f.status === 'warn' || f.status === 'crit', 'Plateau bei 72 °C muss auffallen, war: ' + f.status);
});

test('Diesel-Profil: Benzin-Regeln werden übersprungen', async () => {
  const csv = syntheticDrive({ duration: 300, dt: 0.5, speed: () => 60,
    extra: () => [['Long term fuel % trim - Bank 1', 3.1, '%'], ['Timing advance', 10, '°']] });
  const l = find((await diag(csv, 'fallback_diesel_cr_4zyl')).res, 'ltft_b1');
  assert.ok(!l || l.status === 'unklar', 'LTFT-Regel darf beim Diesel nicht bewerten');
});
