const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const ctx = load();
const g = name => ctx.get(name);

test('Schaltanalyse: Schaltpunkte, Dauer, Zeitanteile, Kickdown', () => {
  const N = 400, grid = new Float64Array(N).map((_, i) => i);
  const rpm = new Float64Array(N), spd = new Float64Array(N), pedal = new Float64Array(N), assign = new Int16Array(N).fill(-1);
  /* Gang 1 (0–39): Drehzahl steigt bis 3000; Lücke 1 s; Gang 2 (41–99): 1800→3200; Lücke; Gang 3 (101–199) 2000→3400;
     Runterschalten mit Pedal (200–249 Gang 2), dann Gang 3 bis Ende */
  const seg = (a, b, gi, r0, r1, v0, v1, ped) => { for (let i = a; i <= b; i++) { const f = (i - a) / Math.max(1, b - a); assign[i] = gi; rpm[i] = r0 + (r1 - r0) * f; spd[i] = v0 + (v1 - v0) * f; pedal[i] = ped; } };
  seg(0, 39, 0, 1200, 3000, 5, 30, 40); seg(41, 99, 1, 1800, 3200, 32, 60, 40); seg(101, 199, 2, 2000, 3400, 62, 100, 40);
  seg(201, 249, 1, 3800, 4200, 90, 110, 90); seg(251, 399, 2, 3000, 3200, 110, 120, 30);
  const ds = { grid, step: 1, G: { rpm, speed_mix: spd, pedal } };
  const gears = { assign, remap: [1, 2, 3], gears: [{ gear: 1, label: '1' }, { gear: 2, label: '2' }, { gear: 3, label: '3' }] };
  const sa = g('shiftAnalysis')(ds, gears);
  assert.equal(sa.ok, true);
  assert.equal(sa.n, 4);
  assert.equal(sa.shifts.filter(s => s.up).length, 3); assert.equal(sa.shifts.filter(s => !s.up).length, 1);
  const u12 = sa.up.find(u => u.from === 1 && u.to === 2);
  assert.ok(u12 && u12.rpmMed > 2900 && u12.rpmMed <= 3000, '1→2 bei ' + u12.rpmMed);
  assert.ok(Math.abs(u12.rpmAfter - 1830) < 60, 'danach ' + u12.rpmAfter);
  assert.equal(sa.kickdowns, 1, 'Rückschaltung bei 90 % Pedal ist ein Kickdown');
  assert.equal(sa.durMedian, 1);
  const g3 = sa.perGear.find(p => p.gear === 3); assert.ok(g3.share > 0.5, 'Gang 3 dominiert: ' + g3.share);
  assert.equal(sa.labelOf(2), '2');
  const none = g('shiftAnalysis')({ grid, G: {} }, gears); assert.equal(none.ok, false);
});
