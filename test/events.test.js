const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const ctx = load();
const g = name => ctx.get(name);

test('Ereignisse: Stopps, Volllast, Klopfen aus den Segmenten; Bremsung und Betriebswarm eigen erkannt', () => {
  const N = 600, grid = new Float64Array(N).map((_, i) => 1000 + i);
  const accel = new Float64Array(N), speed = new Float64Array(N).fill(60), coolant = new Float64Array(N);
  for (let i = 0; i < N; i++) coolant[i] = Math.min(95, 40 + i * 0.2);          // warm nach 200 s
  for (let i = 300; i < 304; i++) accel[i] = -0.45;                             // 4 s starke Bremsung
  const ds = { grid, t0: 1000, G: { accel, speed_mix: speed, coolant }, meta: {},
    events: { stops: [{ i0: 10, i1: 20, t0: 1010, dur: 10 }], wot: [{ i0: 100, i1: 108, rpmMax: 6200, speedMax: 140, boostMax: 0.7 }],
              sprints: [{ i0: 100, t0: 1100, from: 80, to: 120, dur: 3.4 }], knock: [{ i0: 150, i1: 152, t0: 1150, dur: 1.2, drop: 5.5, timingMin: 3, rpmMax: 5000 }] } };
  const ev = g('driveEvents')(ds);
  const kinds = ev.map(e => e.kind);
  assert.deepEqual(kinds.filter(k => k === 'stop').length, 1);
  assert.ok(kinds.includes('wot') && kinds.includes('sprint') && kinds.includes('knock'));
  const br = ev.find(e => e.kind === 'brake'); assert.ok(br, 'Bremsung erkannt'); assert.ok(br.t >= 1300 && br.t <= 1304);
  const warm = ev.find(e => e.kind === 'warm'); assert.ok(warm); assert.equal(warm.t, 1200);
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t, 'zeitlich sortiert');
  ev.forEach(e => assert.ok(e.code && e.color && e.time));
});

test('Sollbänder und Anmerkungen', () => {
  const J = v => JSON.stringify(Array.from(v));
  assert.equal(J(g('specBandFor')('coolant', { specs: { coolantGreen: [88, 102] } })), '[88,102]');
  assert.equal(J(g('specBandFor')('coolant', null)), '[85,105]');
  assert.equal(J(g('specBandFor')('ltft_b1', null)), '[-5,5]');
  assert.equal(g('specBandFor')('rpm', null), null);
  const s = g('sortNotes')([{ t: 30, text: 'b' }, { t: 10, text: 'a' }, { t: 20, text: '' }, null]);
  assert.equal(JSON.stringify(s.map(n => n.text)), '["a","b"]');
  assert.equal(g('notesKey')('f_abc'), 'notes:f_abc');
});

test('Wiederkehrende Abschnitte: Hin- und Rückweg wird erkannt und je Durchfahrt bewertet', () => {
  /* Gerade Strecke 2 km hin, dann zurück – jede Zelle zweimal besucht */
  const pts = [];
  const N = 200;
  for (let i = 0; i < N; i++) pts.push({ lat: 53 + i * 0.00009, lon: 10, d: i * 10, t: i * 2 });          // hin, 5 m/s
  for (let i = N - 1; i >= 0; i--) pts.push({ lat: 53 + i * 0.00009, lon: 10, d: (2 * N - 1 - i) * 10, t: 400 + (N - 1 - i) * 1 });  // zurück, 10 m/s
  const tr = { n: pts.length, lat: Float64Array.from(pts.map(p => p.lat)), lon: Float64Array.from(pts.map(p => p.lon)),
    dist: Float64Array.from(pts.map(p => p.d)), t: Float64Array.from(pts.map(p => p.t)), gaps: [] };
  const segs = g('repeatSegments')(tr);
  assert.ok(segs.length >= 1, 'mindestens ein wiederkehrender Abschnitt');
  const s = segs[0];
  assert.equal(s.laps.length, 2, 'zwei Durchfahrten');
  assert.ok(s.best.dur < s.laps[0].dur + 1, 'die schnellste ist die Rückfahrt');
  assert.ok(s.spreadS > 10, 'Spanne zwischen den Durchfahrten: ' + s.spreadS);
  assert.ok(s.lengthM >= 500);
  /* Einfache Gerade ohne Wiederholung */
  const einweg = { n: N, lat: Float64Array.from(pts.slice(0, N).map(p => p.lat)), lon: Float64Array.from(pts.slice(0, N).map(p => p.lon)),
    dist: Float64Array.from(pts.slice(0, N).map(p => p.d)), t: Float64Array.from(pts.slice(0, N).map(p => p.t)), gaps: [] };
  assert.equal(g('repeatSegments')(einweg).length, 0);
});
