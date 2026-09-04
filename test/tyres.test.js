const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const ctx = load();
const g = name => ctx.get(name);

test('Reifengröße: Schreibweisen, Durchmesser, Abrollumfang', () => {
  const p = g('parseTyre');
  const t = p('255/35 R19');
  assert.equal(t.rim, 19); assert.equal(t.width, 255); assert.equal(t.aspect, 35);
  assert.ok(Math.abs(t.diameterMm - 661.1) < 0.5, 'Durchmesser ' + t.diameterMm);
  assert.ok(Math.abs(t.rollCircum - 2.077) < 0.005, 'Abrollumfang ' + t.rollCircum);
  assert.equal(p('255/35ZR19').label, '255/35 R19');
  assert.equal(p('225/50 R 17').diameterMm.toFixed(1), '656.8');
  assert.equal(p('255/35-19').rim, 19);
  assert.equal(p('Quatsch'), null); assert.equal(p('999/35 R19'), null);
});

test('Kandidaten: Größen mit gleichem Abrollumfang, sortiert nach Abweichung', () => {
  const c = g('tyreCandidates')(g('parseTyre')('255/35 R19').rollCircum, 1.5);
  assert.ok(c.length >= 3);
  assert.ok(c.some(x => x.label === '255/35 R19'), 'die eigene Größe ist dabei');
  assert.ok(Math.abs(c[0].dev) <= Math.abs(c[c.length - 1].dev));
  c.forEach(x => assert.ok(Math.abs(x.dev) <= 1.5));
});

test('Reifenfaktor aus OBD und GPS: ruhige Punkte, Median, Klassen, Qualität', () => {
  const N = 1200, step = 1;
  const grid = new Float64Array(N).map((_, i) => i * step);
  const speed = new Float64Array(N), gps = new Float64Array(N), accel = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const v = 30 + 60 * (0.5 + 0.5 * Math.sin(i / 120));       // 30 … 90 km/h, langsam schwingend
    speed[i] = v; gps[i] = v * 0.97 + (i % 7 - 3) * 0.3;         // Reifen 3 % kleiner, GPS-Rauschen ±1 km/h
    accel[i] = i > 0 ? (speed[i] - speed[i - 1]) / 3.6 / step / 9.81 : 0;   // in g
  }
  /* ein paar GPS-Ausreißer und Beschleunigungsphasen */
  gps[100] = 5; gps[200] = 150; accel[300] = 0.25;
  const r = g('speedRatioAnalysis')({ speed, speed_gps: gps, accel }, grid);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.k - 0.97) < 0.004, 'k = ' + r.k);
  assert.ok(Math.abs(r.slope - 0.97) < 0.004, 'Steigung = ' + r.slope);
  assert.ok(r.n > 300, 'n = ' + r.n);
  assert.equal(r.consistent, true);
  assert.ok(r.bins.filter(b => b.k === b.k).length >= 2);
  const none = g('speedRatioAnalysis')({ speed }, grid);
  assert.equal(none.ok, false);
});

test('Deutung und Tempomat-Tabelle', () => {
  const t = g('parseTyre')('255/35 R19');
  const it = g('tyreInterpretation')(0.97, t.rollCircum, t);
  assert.ok(Math.abs(it.devMountedPct - (-3)) < 0.01);
  assert.ok(it.treadMm > 9 && it.treadMm < 11, 'Profilverlust ≈ 10 mm: ' + it.treadMm);
  const rows = g('cruiseTable')(0.97, 0, 0, [100, 130]);
  assert.equal(rows[0].set, 100); assert.ok(Math.abs(rows[0].real - 97) < 0.01);
  const rows2 = g('cruiseTable')(1, 4, 2, [130]);
  assert.ok(Math.abs(rows2[0].real - (128 / 1.04)) < 0.01, 'Tacho-Voreilung wird herausgerechnet');
});
