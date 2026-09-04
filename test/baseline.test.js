const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const ctx = load();
const g = name => ctx.get(name);

const day = 86400000;
const mkRows = (vals, ruleId) => vals.map((v, i) => ({ id: 'f' + i, date: Date.UTC(2026, 0, 1) + i * 14 * day, profileId: 'p',
  diag: [{ id: ruleId || 'cac_recovery', status: 'ok', value: v, unit: 'K', ref: '≤ 10 K', refLo: 0, refHi: 10 }] }));

test('Baseline: Median, robustes Streuband, Trend je 30 Tage', () => {
  const b = g('baselineFor')(mkRows([5.0, 5.2, 4.9, 5.1, 5.0, 5.3]), 'cac_recovery');
  assert.equal(b.ok, true); assert.equal(b.n, 6);
  assert.ok(Math.abs(b.median - 5.05) < 0.11, 'Median ' + b.median);
  assert.ok(b.sigma > 0.05 && b.sigma < 0.4, 'Sigma ' + b.sigma);
  assert.ok(b.band[0] < b.median && b.band[1] > b.median);
  assert.ok(Math.abs(b.slope30) < 0.3, 'kein Trend: ' + b.slope30);
  const steigend = g('baselineFor')(mkRows([4.0, 4.5, 5.0, 5.5, 6.0, 6.5]), 'cac_recovery');
  assert.ok(steigend.slope30 > 0.9 && steigend.slope30 < 1.2, 'Trend je 30 Tage: ' + steigend.slope30);
  assert.equal(g('baselineFor')(mkRows([1, 2, 3]), 'cac_recovery').ok, false, 'unter fünf Fahrten keine Baseline');
});

test('Baseline-Prüfung: eigener Ausreißer im Werksband wird erkannt', () => {
  const rows = mkRows([5.0, 5.2, 4.9, 5.1, 5.0, 5.3]);
  rows.push({ id: 'now', date: Date.UTC(2026, 3, 1), profileId: 'p',
    diag: [{ id: 'cac_recovery', status: 'ok', value: 8.5, unit: 'K', ref: '≤ 10 K', refLo: 0, refHi: 10 }] });
  const chk = g('baselineCheck')(rows, 'cac_recovery', 8.5, 'now');
  assert.equal(chk.ok, true);
  assert.equal(chk.outside, true, 'z = ' + chk.z);
  assert.equal(chk.insideSpec, true, 'liegt im Werksband');
  assert.equal(chk.kind, 'eigen');
  const normal = g('baselineCheck')(rows, 'cac_recovery', 5.1, 'now');
  assert.equal(normal.outside, false); assert.equal(normal.kind, 'normal');
  const zuWenig = g('baselineCheck')(mkRows([1, 2]), 'cac_recovery', 3, 'f0');
  assert.equal(zuWenig.ok, false);
});

test('Wartungsstand: Intervalle je Bauart, Restlaufzeit, Fälligkeit', () => {
  const prof = { fuel: 'petrol', aspiration: 'kompressor', specs: { timingDrive: 'Kette' } };
  const now = Date.UTC(2026, 8, 4);
  const state = { km: 185000, done: { oil: { km: 178000, date: Date.UTC(2025, 8, 1) }, brakefluid: { date: Date.UTC(2023, 0, 1) }, spark: { km: 110000 } } };
  const list = g('serviceStatus')(prof, state, now);
  const by = id => list.find(x => x.id === id);
  assert.ok(!by('timing'), 'Kette: kein Zahnriemen-Punkt');
  assert.ok(!by('dpf'), 'Benziner: kein Partikelfilter');
  assert.ok(by('compressor'), 'Kompressoröl beim Kompressor');
  const oil = by('oil');
  assert.equal(oil.dueKm, 193000); assert.equal(oil.kmLeft, 8000);
  assert.equal(oil.status, 'over', 'Ölwechsel 09/2025, Jahresintervall am 04.09.2026 überschritten → ' + oil.daysLeft + ' Tage');
  assert.ok(oil.daysLeft < 0 && oil.daysLeft > -10, 'knapp überfällig: ' + oil.daysLeft);
  const bf = by('brakefluid');
  assert.equal(bf.status, 'over'); assert.ok(bf.daysLeft < 0);
  assert.equal(by('spark').status, 'over', 'Kerzen zuletzt bei 110.000, Intervall 60.000 → seit 15.000 km überfällig');
  assert.equal(by('spark').kmLeft, -15000);
  assert.equal(by('cabin').status, 'unknown');
  const diesel = g('serviceStatus')({ fuel: 'diesel', specs: { timingDrive: 'Zahnriemen' } }, {}, now);
  assert.ok(diesel.find(x => x.id === 'dpf') && diesel.find(x => x.id === 'timing') && !diesel.find(x => x.id === 'spark'));
});
