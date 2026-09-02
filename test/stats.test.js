'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, longCsv } = require('./harness');
const c = load();
async function dataset(csv) { return c.buildDataset(await c.parseCSV(csv, () => {}), { fuel: 'petrol' }); }

test('Konstantfahrt mit 1-Hz-GPS-Tempo erzeugt keine Phantom-Phasen', async () => {
  const rows = [];
  for (let t = 0; t <= 300; t++) { rows.push([t, 'Speed (GPS)', 52 + (t % 2 ? 1 : -1), 'km/h']); rows.push([t, 'Engine RPM', 1800 + (t % 3), 'rpm']); }
  const ds = await dataset(longCsv(rows));
  const ph = ds.phases.time;
  assert.ok(ph.cruise > 280, 'Konstantfahrt: ' + ph.cruise);
  assert.ok((ph.accel || 0) + (ph.brake || 0) < 10, 'accel+brake: ' + ((ph.accel || 0) + (ph.brake || 0)));
  assert.ok(ds.trip.brakeShare < 0.02);
});

test('erster GPS-Fix weit daneben wird verworfen', async () => {
  const rows = [[0, 'Speed (GPS)', 50, 'km/h', 51.5, 13.4]];
  for (let t = 1; t <= 600; t++) rows.push([t, 'Speed (GPS)', 50, 'km/h', 52.5, (13.4 + t * 0.0002).toFixed(6)]);
  const ds = await dataset(longCsv(rows));
  assert.equal(ds.track.rejected, 1);
  assert.ok(ds.trip.distGps < 10, 'Strecke ohne den 111-km-Sprung: ' + ds.trip.distGps);
});

test('Höhenrauschen erzeugt keine Phantom-Höhenmeter', async () => {
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5;
  const rows = [];
  for (let t = 0; t <= 1800; t++) {
    rows.push([t, 'Altitude (GPS)', (100 + rnd() * 5).toFixed(1), 'm', 52.5, (13.4 + t * 0.00002).toFixed(6)]);
    rows.push([t, 'Speed (GPS)', 50, 'km/h']);
  }
  const ds = await dataset(longCsv(rows));
  assert.ok(ds.trip.ascent < 30, 'bergauf: ' + ds.trip.ascent);
  assert.ok(ds.trip.descent < 30, 'bergab: ' + ds.trip.descent);
});

test('Sprintzeit bei 1-Hz-Quelle wird zwischen Messpunkten interpoliert', async () => {
  const rows = [];
  for (let t = 0; t <= 40; t++) {
    const v = t < 5 ? 0 : t < 15 ? (t - 5) * 10 : 100;
    rows.push([t, 'Speed (GPS)', v, 'km/h']); rows.push([t, 'Engine RPM', 1500 + v * 20, 'rpm']);
  }
  const ds = await dataset(longCsv(rows));
  const s = ds.events.sprints.find(x => x.from === 0 && x.to === 100);
  assert.ok(s, 'Sprint 0->100 nicht gefunden');
  assert.ok(Math.abs(s.dur - 10) < 0.7, 'gemessen ' + s.dur.toFixed(2) + ' s statt 10 s');
});

test('Streckenwahl: Ausfall der ganzen Aufzeichnung zählt nicht als Fahrleistung', async () => {
  const rows = [];
  for (let t = 0; t < 60; t++) { rows.push([t, 'Vehicle speed', 0, 'km/h', 52.5, 13.4]); rows.push([t, 'Engine RPM', 700, 'rpm']); rows.push([t, 'Distance travelled', 0, 'km']); }
  for (let t = 1260; t < 1320; t++) {
    rows.push([t, 'Vehicle speed', 60, 'km/h', 52.7, (13.4 + (t - 1260) * 0.0002).toFixed(6)]);
    rows.push([t, 'Engine RPM', 1800, 'rpm']);
    rows.push([t, 'Distance travelled', ((t - 1260) * 60 / 3.6 / 1000).toFixed(3), 'km']);
  }
  const ds = await dataset(longCsv(rows));
  assert.ok(ds.trip.gapBlackout > 20, 'Ausfallstrecke erkannt: ' + ds.trip.gapBlackout);
  assert.ok(ds.trip.dist < 2, 'gemessene Strecke ~1 km, nicht 23: ' + ds.trip.dist);
});

test('Streckenwahl: GPS-Aussetzer bei laufender Aufzeichnung bleibt Fahrleistung', async () => {
  const rows = [];
  for (let t = 0; t < 600; t++) {
    rows.push([t, 'Vehicle speed', 72, 'km/h']); rows.push([t, 'Engine RPM', 2000, 'rpm']);
    if (t < 200 || t > 400)
      rows.push([t, 'Altitude (GPS)', 100, 'm', 52.5, (13.4 + t * 72 / 3.6 / 111320 / Math.cos(52.5 * Math.PI / 180)).toFixed(7)]);
  }
  const ds = await dataset(longCsv(rows));
  assert.equal(ds.trip.gapBlackout, 0);
  assert.ok(Math.abs(ds.trip.dist - 12) < 0.6, 'ganze Strecke ~12 km: ' + ds.trip.dist);
});

test('minOf/maxOf verkraften große Felder', () => {
  const a = new Float64Array(300000); for (let i = 0; i < a.length; i++) a[i] = Math.sin(i / 1000) * 20;
  assert.ok(Math.abs(c.maxOf(a) - 20) < 1e-3);
  assert.ok(Math.abs(c.minOf(a) + 20) < 1e-3);
});

test('reines Motor-Log ohne Geschwindigkeit bricht nicht', async () => {
  const rows = [];
  for (let t = 0; t < 300; t++) rows.push([t, 'Engine RPM', 800 + t % 50, 'rpm']);
  const ds = await dataset(longCsv(rows));
  assert.equal(ds.G.speed_mix, undefined);
  assert.ok(ds.stats.rpm);
});
