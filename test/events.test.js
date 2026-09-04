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
