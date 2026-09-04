const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const ctx = load();
const g = name => ctx.get(name);

test('Fahrwiderstandsleistung: Rollen, Luft, Beschleunigung, Steigung', () => {
  const p = { mass: 1800, cd: 0.32, area: 2.2, crr: 0.011 };
  const konstant = g('tractivePowerKW')(100, 0, 0, p);
  assert.ok(konstant > 12 && konstant < 18, '100 km/h konstant ≈ 14,5 kW (Rollen 194 N + Luft 327 N): ' + konstant);
  const beschleunigt = g('tractivePowerKW')(100, 3, 0, p);
  assert.ok(beschleunigt > konstant + 130 && beschleunigt < konstant + 190, 'mit 3 m/s²: ' + beschleunigt);
  const bergauf = g('tractivePowerKW')(100, 0, 0.05, p);
  assert.ok(bergauf - konstant > 20, '5 % Steigung kosten Leistung: ' + (bergauf - konstant));
  assert.ok(!isFinite(g('tractivePowerKW')(0, 1, 0, p)), 'im Stand keine Leistung');
  assert.ok(Math.abs(g('crankFromWheel')(86, 0.86) - 100) < 0.01);
});

test('Leistung aus Volllastzug und Masse aus Leistung', () => {
  /* 1800 kg, konstant 3 m/s² von 50 auf 140 km/h, ebene Strecke */
  const step = 0.5, N = 120;
  const grid = new Float64Array(N).map((_, i) => i * step);
  const v = new Float64Array(N), power = new Float64Array(N);
  const p = { mass: 1800, cd: 0.32, area: 2.2, crr: 0.011 };
  for (let i = 0; i < N; i++) {
    v[i] = 50 + 3 * 3.6 * i * step;
    power[i] = g('tractivePowerKW')(v[i], 3, 0, p);            // Leistung am Rad, für die Massenschätzung
  }
  const ds = { grid, G: { speed_mix: v, power_kw: power }, events: { wot: [{ i0: 2, i1: N - 3 }] } };
  const prof = { specs: { massKg: 1720, cd: 0.32, frontArea: 2.2, powerKW: 245 }, models: '' };
  const pa = g('powerFromAccel')(ds, prof);
  assert.equal(pa.ok, true);
  assert.ok(pa.pulls.length >= 1);
  const wheel = g('tractivePowerKW')(pa.best.v, 3, 0, { mass: 1800, cd: 0.32, area: 2.2, crr: 0.011 });
  assert.ok(Math.abs(pa.best.kw - wheel / 0.86) < 12, 'Kurbelwellenleistung passt: ' + pa.best.kw + ' vs ' + (wheel / 0.86));
  assert.ok(pa.best.v > 130, 'Spitzenleistung am Ende des Zugs: ' + pa.best.v);
  /* Masse: power_kw ist hier die Radleistung, deshalb Wirkungsgrad 1 vorgeben */
  const ma = g('massFromPower')(ds, prof, { driveline: 1 });
  assert.equal(ma.ok, true);
  assert.ok(Math.abs(ma.median - 1800 * 1.06) < 120, 'Masse ≈ 1800 kg (mit Rotationszuschlag): ' + ma.median);
  const leer = g('massFromPower')({ grid, G: { speed_mix: v } }, prof);
  assert.equal(leer.ok, false);
});
