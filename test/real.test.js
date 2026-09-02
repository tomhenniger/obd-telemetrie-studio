'use strict';
/* Läuft nur lokal gegen die echten Aufzeichnungen (nicht im Repo, GPS ist privat).
   Erwartungswerte unabhängig in Python nachgerechnet. Start: OBD_REAL=1 npm run test:real */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load } = require('./harness');
const FILES = {
  erste:    { path: path.join(__dirname, '..', 'data', 'demo.csv'), rows: 276935, dist: 29.28, gears: 6, sprint50100: 4.51, stops: 2, knock: 9 },
  kontroll: { path: '/Users/tomhenniger/Downloads/Telegram Desktop/2026-08-27 08-37-34.csv', rows: 56811, dist: 10.54, gears: 0, stops: 1, blackout: 22.5 },
  lang:     { path: '/Users/tomhenniger/Downloads/Telegram Desktop/2026-08-30 11-19-42.csv', rows: 872228, dist: 107.67, gears: 5, sprint80120: 3.35, stops: 6, warmup: 394, cons: 13.39 }
};
const enabled = process.env.OBD_REAL === '1';
for (const [name, exp] of Object.entries(FILES)) {
  const skip = (!enabled || !fs.existsSync(exp.path)) ? 'nur lokal mit OBD_REAL=1' : false;
  test('echte Aufzeichnung: ' + name, { skip }, async () => {
    const c = load();
    const ds = c.buildDataset(await c.parseCSV(fs.readFileSync(exp.path, 'utf8'), () => {}), { fuel: 'petrol' });
    const g = c.computeGears(ds, 2.077, null, 7000);
    assert.equal(ds.meta.rows, exp.rows);
    assert.ok(Math.abs(ds.trip.dist - exp.dist) < 0.05, 'Strecke ' + ds.trip.dist);
    assert.equal(g ? g.gears.length : 0, exp.gears);
    assert.equal(ds.events.stops.length, exp.stops);
    if (exp.sprint50100) { const s = ds.events.sprints.find(x => x.from === 50); assert.ok(Math.abs(s.dur - exp.sprint50100) < 0.05); }
    if (exp.sprint80120) { const s = ds.events.sprints.find(x => x.from === 80); assert.ok(Math.abs(s.dur - exp.sprint80120) < 0.05); }
    if (exp.blackout) assert.ok(Math.abs(ds.trip.gapBlackout - exp.blackout) < 0.1);
    if (exp.warmup) assert.ok(Math.abs(ds.trip.warmupTime - exp.warmup) < 3);
    if (exp.cons) assert.ok(Math.abs(ds.trip.consAvg - exp.cons) < 0.05);
    if (exp.knock !== undefined) assert.equal(ds.events.knock.length, exp.knock);
  });
}
