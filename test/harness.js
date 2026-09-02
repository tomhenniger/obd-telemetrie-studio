/* Lädt die reinen Rechenmodule aus src/ in einen abgeschotteten Kontext.
   Die Oberflächenmodule (Diagramm, Karte, UI, App) bleiben draußen – getestet wird,
   was Zahlen liefert. Gleicher Ladeweg wie build.sh: ein gemeinsamer Scope. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const FILES = ['20-util.js', '21-parse.js', '22-metrics.js', '23-stats.js',
               '26-profiles.js', '26b-gearbox.js', '27-diag.js', '29-ingest.js',
               '30-buycheck.js', '31-aiexport.js', '31b-akte.js', '31c-assist.js'];

function makeStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    clear: () => m.clear(),
    get length() { return m.size; }
  };
}

function load() {
  const ctx = {
    console, Math, Date, JSON, Number, String, Array, Object, Map, Set, Promise, RegExp, Error,
    Float64Array, Float32Array, Int32Array, Int8Array, Uint8Array, Uint16Array, Uint32Array,
    parseInt, parseFloat, isFinite, isNaN, Infinity, NaN, undefined,
    setTimeout, clearTimeout, TextDecoder, TextEncoder, Blob, File, URL, encodeURIComponent,
    decodeURIComponent, Intl, structuredClone,
    performance: { now: () => Number(process.hrtime.bigint() / 1000000n) },
    requestAnimationFrame: fn => setTimeout(fn, 0),
    localStorage: makeStorage(),
    navigator: { userAgent: 'node-test', language: 'de-DE' },
    document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { getAttribute: () => 'dark' },
                createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } }),
                createTextNode: t => ({ nodeValue: String(t) }), body: { appendChild() {} } },
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    location: { hash: '', search: '', pathname: '/' },
    history: { replaceState() {} },
    // Von 31-aiexport gelesen; Tests setzen ds/profile/diag/gears selbst.
    App: { ds: null, profile: null, diag: null, gears: null, fileName: 'test.csv' }
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of FILES) {
    const code = fs.readFileSync(path.join(SRC, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  // const/let aus den Modulen sind lexikalisch und keine Eigenschaften des Kontexts –
  // deshalb ein Lesezugriff per Ausdruck, für Tests der Kataloge und Regeltabellen.
  ctx.get = name => vm.runInContext(name, ctx);
  return ctx;
}

/* CSV im Long-Format erzeugen, wie Car Scanner es schreibt. rows: [t, pid, value, unit, lat?, lon?] */
function longCsv(rows, opts) {
  opts = opts || {};
  const q = s => '"' + String(s) + '"';
  const head = '"SECONDS";"PID";"VALUE";"UNITS";"LATITUDE";"LONGTITUDE";';
  const body = rows.map(r => [q(r[0]), q(r[1]), q(r[2]), q(r[3] || ''),
    q(r[4] !== undefined ? r[4] : ''), q(r[5] !== undefined ? r[5] : '')].join(';') + ';');
  return (opts.bom ? '﻿' : '') + [head].concat(body).join(opts.crlf ? '\r\n' : '\n') + '\n';
}

/* Eine plausible Fahrt synthetisieren: t in Sekunden, Geschwindigkeitsprofil als Funktion. */
function syntheticDrive(opts) {
  opts = opts || {};
  const dur = opts.duration || 300, dt = opts.dt || 0.5, t0 = opts.t0 || 40000;
  const speedAt = opts.speed || (t => 50);
  const rpmAt = opts.rpm || ((t, v) => Math.max(700, v * 30));
  const rows = [];
  let lat = 52.5, lon = 13.4;
  for (let t = 0; t <= dur; t += dt) {
    const v = speedAt(t), r = rpmAt(t, v);
    const tt = (t0 + t).toFixed(3);
    rows.push([tt, 'Vehicle speed', v.toFixed(1), 'km/h']);
    rows.push([tt, 'Engine RPM', r.toFixed(0), 'rpm']);
    if (opts.coolant) rows.push([tt, 'Engine coolant temperature', opts.coolant(t).toFixed(0), '℃']);
    if (opts.load) rows.push([tt, 'Absolute load value', opts.load(t, v).toFixed(1), '%']);
    if (opts.gps && Math.abs(t % 1) < 1e-9) {
      lon += (v / 3.6) / 111320 / Math.cos(lat * Math.PI / 180);   // nach Osten
      rows.push([tt, 'Altitude (GPS)', (opts.alt ? opts.alt(t) : 100).toFixed(1), 'm', lat.toFixed(7), lon.toFixed(7)]);
    }
    if (opts.extra) opts.extra(t, v, r).forEach(x => rows.push([tt].concat(x)));
  }
  return longCsv(rows);
}

module.exports = { load, longCsv, syntheticDrive };
