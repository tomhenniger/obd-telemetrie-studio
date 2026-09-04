const test = require('node:test');
const assert = require('node:assert/strict');
const { load, longCsv, syntheticDrive } = require('./harness');
const ctx = load();
const g = name => ctx.get(name);

async function drive() {
  const csv = syntheticDrive({ duration: 300, dt: 1,
    speed: t => (t < 60 ? t : t < 240 ? 60 + 20 * Math.sin(t / 30) : Math.max(0, 60 - (t - 240))),
    rpm: (t, v) => 800 + v * 32, coolant: t => Math.min(92, 40 + t * 0.3), load: (t, v) => 20 + v * 0.6,
    gps: true });
  const parsed = await ctx.parseCSV(csv, () => {});
  return ctx.buildDataset(parsed, { fuel: 'petrol' });
}

test('Paket: Kennzahlen, Messreihen und Route überstehen den Umweg unverändert', async () => {
  const ds = await drive();
  const pkg = g('buildPackage')(ds, { id: 'p1', name: 'Testmotor' }, 'fahrt.csv', { rollCircum: 2.077, raster: 'voll' });
  assert.equal(pkg['obd-telemetrie-paket'], 1);
  assert.equal(pkg.datei, 'fahrt.csv');
  assert.equal(pkg.profil, 'p1');
  const roundtrip = o => g('pkgParse')(g('pkgStringify')(o));
  const back = g('datasetFromPackage')(roundtrip(pkg));
  assert.equal(back.N, ds.N); assert.equal(back.step, ds.step);
  assert.ok(Math.abs(back.t0 - ds.t0) < 1e-6 && Math.abs(back.duration - ds.duration) < 1e-6);
  /* Zeitraster deckungsgleich */
  for (const i of [0, 1, Math.floor(ds.N / 2), ds.N - 1]) assert.ok(Math.abs(back.grid[i] - ds.grid[i]) < 1e-6, 'Raster ' + i);
  /* Messreihen: bewusst quantisiert auf 1/32700 der Spanne je Kanal.
     Bei einer Drehzahlspanne von 6000 sind das 0,2 min⁻¹ – unter jeder
     Ablesegenauigkeit, aber die Datei wird dadurch viermal kleiner. */
  for (const id of Object.keys(ds.G)) {
    assert.ok(back.G[id], 'Messgröße fehlt: ' + id);
    const st = ds.stats[id];
    const span = st && isFinite(st.max - st.min) ? Math.max(1e-6, st.max - st.min) : 1;
    for (let i = 0; i < ds.N; i += Math.max(1, Math.floor(ds.N / 200))) {
      const a = ds.G[id][i], b = back.G[id][i];
      if (a !== a) { assert.ok(b !== b, id + ': Lücke ging verloren'); continue; }
      assert.ok(Math.abs(a - b) <= span / 20000, id + '[' + i + ']: ' + a + ' → ' + b + ' (Spanne ' + span + ')');
    }
  }
  /* Route */
  assert.equal(back.track.n, ds.track.n);
  assert.ok(Math.abs(back.track.lat[10] - ds.track.lat[10]) < 1e-6, 'Position auf sieben Stellen genau');
  assert.ok(Math.abs(back.track.totalDist - ds.track.totalDist) < 1);
  /* Beschreibungen und Statistik */
  assert.equal(back.metrics.size, ds.metrics.size);
  const m = back.metrics.get('rpm');
  assert.equal(m.label, ds.metrics.get('rpm').label);
  assert.equal(m.unit, ds.metrics.get('rpm').unit);
  assert.ok(Math.abs(back.stats.rpm.max - ds.stats.rpm.max) < 1e-6);
  assert.ok(Math.abs(back.trip.dist - ds.trip.dist) < 1e-9);
  assert.equal(back.events.stops.length, ds.events.stops.length);
});

test('Paket: Diagnose kommt beim Empfänger auf dieselben Befunde', async () => {
  const ds = await drive();
  const prof = ctx.get('defaultProfile')();
  const a = ctx.runDiagnostics(ds, prof);
  const back = g('datasetFromPackage')(g('pkgParse')(g('pkgStringify')(g('buildPackage')(ds, prof, 'x.csv', { raster: 'voll' }))));
  const b = ctx.runDiagnostics(back, prof);
  assert.equal(b.results.length, a.results.length);
  const byId = new Map(a.results.map(r => [r.id, r]));
  let abweichend = 0;
  for (const r of b.results) { const o = byId.get(r.id); if (o && o.status !== r.status) abweichend++; }
  assert.equal(abweichend, 0, abweichend + ' Befunde weichen ab');
  assert.deepEqual(Object.keys(b.tally).map(k => b.tally[k]), Object.keys(a.tally).map(k => a.tally[k]));
});

test('Paket erkennen und benennen', () => {
  assert.equal(g('looksLikePackage')('{"obd-telemetrie-paket":1,"datei":"x"}'), true);
  assert.equal(g('looksLikePackage')('  {\n "obd-telemetrie-paket" : 1 }'), true);
  assert.equal(g('looksLikePackage')('"SECONDS";"PID";"VALUE"\n"0";"RPM";"800"'), false);
  assert.equal(g('looksLikePackage')(''), false);
  assert.match(g('packageFileName')('2026-08-30 11-19-42.csv', 'Audi 3.0 TFSI · 333 PS'), /^2026-08-30 11-19-42 · Audi 3\.0 TFSI\.obdpaket\.json\.gz$/);
  assert.throws(() => g('datasetFromPackage')({ foo: 1 }), /kein Auswertungspaket/);
});

test('Paket: fehlende Werte bleiben fehlend statt zu null zu werden', () => {
  const round = o => g('pkgParse')(g('pkgStringify')(o));
  const back = round({ a: NaN, b: 1.5, c: Infinity, d: -Infinity, e: null, f: [NaN, 2] });
  assert.ok(Number.isNaN(back.a), 'NaN überlebt den Umweg');
  assert.equal(back.b, 1.5);
  assert.equal(back.c, Infinity);
  assert.equal(back.d, -Infinity);
  assert.equal(back.e, null, 'echtes null bleibt null');
  assert.ok(Number.isNaN(back.f[0]) && back.f[1] === 2, 'auch innerhalb von Arrays');
  /* Ohne Kodierung würde aus NaN eine Null - genau das soll nicht passieren */
  assert.equal(JSON.parse(JSON.stringify({ x: NaN })).x, null);
});

test('Paket dünnt feine Raster auf eine Messung je Sekunde aus, Ereigniszeiten bleiben', async () => {
  const csv = syntheticDrive({ duration: 200, dt: 0.2,
    speed: t => (t < 40 ? t * 1.5 : t < 160 ? 60 : Math.max(0, 60 - (t - 160) * 2)),
    rpm: (t, v) => 800 + v * 32, coolant: t => Math.min(92, 40 + t * 0.4), load: (t, v) => 20 + v * 0.6 });
  const parsed = await ctx.parseCSV(csv, () => {});
  const ds = ctx.buildDataset(parsed, { fuel: 'petrol' });
  assert.ok(ds.step < 1, 'Testfahrt hat ein feines Raster: ' + ds.step);
  const voll = g('buildPackage')(ds, null, 'f.csv', { raster: 'voll' });
  const duenn = g('buildPackage')(ds, null, 'f.csv', {});
  assert.equal(voll.N, ds.N);
  assert.ok(duenn.N < ds.N / 3, 'ausgedünnt: ' + duenn.N + ' statt ' + ds.N);
  assert.ok(Math.abs(duenn.step - 1) < 1e-9, 'Schrittweite 1 s: ' + duenn.step);
  assert.equal(duenn.raster.ausgeduennt, Math.round(1 / ds.step));
  const back = g('datasetFromPackage')(g('pkgParse')(g('pkgStringify')(duenn)));
  /* Zeitachse endet dort, wo sie soll */
  assert.ok(Math.abs(back.grid[0] - ds.grid[0]) < 1e-6);
  assert.ok(Math.abs(back.grid[back.N - 1] - ds.grid[ds.N - 1]) <= 1.001, 'Ende passt: ' + back.grid[back.N - 1] + ' vs ' + ds.grid[ds.N - 1]);
  /* Ereignisse zeigen weiter auf dieselben Zeitpunkte */
  if (ds.events.stops.length) {
    const a = ds.grid[ds.events.stops[0].i0], b = back.grid[back.events.stops[0].i0];
    assert.ok(Math.abs(a - b) <= 1.001, 'Stopp bleibt bei ' + a + ' (Paket: ' + b + ')');
  }
  if (ds.phases && ds.phases.segs.length) {
    const s = ds.phases.segs[0], t = back.phases.segs[0];
    assert.ok(t.i1 < back.N, 'Phasenindex bleibt im Raster');
    assert.ok(Math.abs(ds.grid[s.i1] - back.grid[t.i1]) <= 1.001);
  }
});

test('Paket ohne Route: Kennzahlen bleiben, Positionen fehlen', async () => {
  const ds = await drive();
  assert.ok(ds.track && ds.track.n > 5, 'Testfahrt hat eine Route');
  const ohne = g('buildPackage')(ds, null, 'f.csv', { ohneRoute: true, raster: 'voll' });
  assert.equal(ohne.track, null);
  assert.equal(ohne.ohneRoute, true);
  const json = g('pkgStringify')(ohne);
  assert.ok(!/"lat"|"lon"/.test(json), 'keine Positionsdaten im Paket');
  const back = g('datasetFromPackage')(g('pkgParse')(json));
  assert.equal(back.track, null);
  assert.ok(Math.abs(back.trip.dist - ds.trip.dist) < 1e-9, 'Streckenlänge bleibt erhalten');
  assert.ok(back.G.rpm && back.G.rpm.length === ds.N, 'Messreihen bleiben vollständig');
  /* Mit Route ist sie drin */
  const mit = g('buildPackage')(ds, null, 'f.csv', { raster: 'voll' });
  assert.ok(mit.track && mit.track.n === ds.track.n);
});
