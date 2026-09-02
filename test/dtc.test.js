'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const c = load();

test('Codes aus freiem Text, ohne Doppelte, Groß-/Kleinschreibung egal', () => {
  const codes = c.parseDtcInput('Gespeichert: p0300, P0171 (pending) P0171\nP1234 U0100 B1000 Bremse 12V P0299');
  assert.deepEqual(Array.from(codes), ['P0300', 'P0171', 'P1234', 'U0100', 'B1000', 'P0299']);
});

test('genormte Codes werden gedeutet, Herstellercodes benannt, aber nicht erfunden', () => {
  const a = c.dtcLookup('P0299');
  assert.ok(/Ladedruck zu niedrig/.test(a.title) && a.generic && a.rules.includes('load_wot'));
  const b = c.dtcLookup('P1234');
  assert.equal(b.generic, false);
  assert.ok(/herstellerspezifisch/.test(b.title) && b.rules.length === 0);
});

test('jede Regel in der DTC-Tabelle existiert', () => {
  const ids = new Set(c.get('DIAG_RULES').map(r => r.id));
  const table = c.get('DTC_TABLE');
  for (const [code, e] of Object.entries(table)) for (const id of e.rules) assert.ok(ids.has(id), code + ' verweist auf unbekannte Regel ' + id);
  assert.ok(Object.keys(table).length >= 100);
});

test('Abgleich mit den Befunden: gestützt, entkräftet, offen', () => {
  const results = [
    { id: 'load_wot', status: 'crit' }, { id: 'boost_wot', status: 'unklar' },
    { id: 'ltft_b1', status: 'ok' }, { id: 'ltft_load_dep', status: 'ok' }, { id: 'stft_bias', status: 'missing' },
    { id: 'maf_sanity', status: 'missing' }, { id: 'fuel_pressure', status: 'missing' }
  ];
  const x = c.dtcCrossCheck(['P0299', 'P0171', 'P0442'], results);
  assert.ok(/stützt/.test(x[0].verdict) && x[0].supporting.includes('load_wot'));
  assert.ok(/teils unauffällig/.test(x[1].verdict));
  assert.equal(x[2].verdict, 'ohne Messbild');
});
