'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, longCsv, syntheticDrive } = require('./harness');
const c = load();

test('jede Regel hat einen Eintrag in RULE_NEEDS oder braucht keine Situation', () => {
  const rules = c.get('DIAG_RULES'), needs = c.get('RULE_NEEDS');
  const without = rules.map(r => r.id).filter(id => !needs[id]);
  assert.equal(without.length, 0, 'ohne Situationsangabe: ' + without.join(', '));
  for (const k of Object.values(needs).flat()) assert.ok(c.get('SITUATIONS')[k], 'Situation unbekannt: ' + k);
});

test('dünne Aufzeichnung: fehlende PIDs und Situationen werden benannt', async () => {
  // nur Drehzahl und Geschwindigkeit, warm, kein Volllastzug, kein Leerlauf
  const rows = [];
  for (let t = 0; t < 600; t++) { rows.push([t, 'Engine RPM', 2000, 'rpm']); rows.push([t, 'Vehicle speed', 70, 'km/h']); rows.push([t, 'Engine coolant temperature', 90, '℃']); }
  const ds = c.buildDataset(await c.parseCSV(longCsv(rows), () => {}), { fuel: 'petrol' });
  const diag = c.runDiagnostics(ds, c.profileById('audi_s5_b85_cgwc'));
  const a = c.buildAssist(diag.results, Object.keys(ds.G), c.profileById('audi_s5_b85_cgwc'));
  const pidIds = a.pids.map(p => p.id);
  assert.ok(pidIds.includes('ltft_b1') && pidIds.includes('timing') && pidIds.includes('load_abs'), pidIds.join(','));
  assert.ok(a.pids[0].app.length > 3 && /01 /.test(a.pids.find(p => p.id === 'timing').code));
  const sitKeys = a.situations.map(s => s.key);
  assert.ok(sitKeys.includes('leerlauf') && sitKeys.includes('volllast') && sitKeys.includes('kaltstart'), sitKeys.join(','));
  assert.ok(pidIds.includes('speed_gps'), 'GPS-Geschwindigkeit fehlt als PID-Empfehlung');
  // Reihenfolge: Kaltstart vor Leerlauf vor Volllast
  const order = a.situations.map(s => s.order);
  assert.deepEqual(order, order.slice().sort((x, y) => x - y));
  const txt = c.assistText(a, 'Testwagen');
  assert.ok(/In der OBD-App zusätzlich aufzeichnen/.test(txt) && /So fahren/.test(txt));
});

test('vollständige Aufzeichnung: nichts offen', async () => {
  const csv = syntheticDrive({ duration: 1500, dt: 0.5,
    speed: t => t > 1400 ? 0 : (t > 700 && t < 726) ? 60 + (t - 700) * 6 : 70,
    rpm: (t, v) => v < 1 ? 700 : 1400 + v * 22, coolant: t => Math.min(92, 40 + t * 0.2),
    load: (t, v) => (t > 700 && t < 726) ? 185 : v < 1 ? 28 : 45,
    extra: (t, v) => [['Absolute pedal position D', (t > 700 && t < 726) ? 67 : 18, '%'], ['Timing advance', 12, '°'],
      ['Long term fuel % trim - Bank 1', 3, '%'], ['Long term fuel % trim - Bank 2', 3, '%']] });
  const ds = c.buildDataset(await c.parseCSV(csv, () => {}), { fuel: 'petrol' });
  const diag = c.runDiagnostics(ds, c.profileById('audi_s5_b85_cgwc'));
  const a = c.buildAssist(diag.results, Object.keys(ds.G), c.profileById('audi_s5_b85_cgwc'));
  assert.ok(a.answered >= 8);
  // Was noch fehlt, sind ausschließlich PIDs, keine Fahrsituationen mit Kaltstart
  assert.ok(!a.situations.find(s => s.key === 'kaltstart'), 'Kaltstart wurde gefahren');
});
