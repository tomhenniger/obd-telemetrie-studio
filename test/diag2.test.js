'use strict';
/* Regeln für die bisher ungenutzten Messgrößen und der Diesel-Satz. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, syntheticDrive } = require('./harness');
const c = load();
const find = (r, id) => r.find(x => x.id === id);

async function run(csv, profileId) {
  const ds = c.buildDataset(await c.parseCSV(csv, () => {}), { fuel: 'petrol' });
  return { ds, res: c.runDiagnostics(ds, c.profileById(profileId || 'audi_s5_b85_cgwc')).results };
}

/* Eine reiche Fahrt: warm, Teillast, ein Volllastzug, Leerlauf am Ende – mit allen neuen Größen. */
function richDrive(over) {
  over = over || {};
  return syntheticDrive({
    duration: 1500, dt: 0.5,
    speed: t => t > 1400 ? 0 : (t > 700 && t < 726) ? 60 + (t - 700) * 8 : 60 + 20 * Math.sin(t / 60),
    rpm: (t, v) => v < 1 ? 700 : 1400 + v * 22,
    coolant: t => Math.min(92, 40 + t * 0.2),
    load: (t, v) => (t > 700 && t < 726) ? 185 : v < 1 ? 28 : 45 + 10 * Math.sin(t / 40),
    extra: (t, v) => {
      const wot = t > 700 && t < 726;
      const o2 = over.o2 ? over.o2(t) : (0.45 + 0.4 * Math.sign(Math.sin(t * 2 * Math.PI * 1.2)));
      return [
        ['Absolute pedal position D', wot ? 67 : 18, '%'],
        ['Engine oil temperature', Math.min(105, 30 + t * 0.15), '℃'],
        ['Catalyst Temperature Bank 1 Sensor 1', over.cat ? over.cat(t) : 560 + 60 * Math.sin(t / 90), '℃'],
        ['Short term fuel % trim - Bank 1', over.stft ? over.stft(t) : 2 * Math.sin(t * 3), '%'],
        ['Lambda', 1.0 + 0.01 * Math.sin(t), ''],
        ['O2 Sensor 1 Bank 1 Voltage', o2, 'V'],
        ['Mass air flow rate', v < 1 ? 7.5 : 8 + v * 0.9, 'g/s'],
        ['Fuel pressure', over.fp ? over.fp(t, wot) : (wot ? 380 : 400), 'kPa'],
        ['Control module voltage', over.batt ? over.batt(t) : 14.1, 'V'],
        ['Knock retard', wot ? 1.5 : 0, '°'],
        ['Transmission temperature', Math.min(over.trans || 88, 40 + t * 0.1), '℃'],
        ['Intake air temperature', 28, '℃'],
        ['Ambient air temperature', 20, '℃'],
        ['Calculated instant fuel rate', wot ? 95 : v < 1 ? 0.9 : 4 + v * 0.12, 'L/h']
      ];
    }
  });
}

test('alle 38 Regeln laufen auf einer reichen Fahrt ohne Ausnahme und liefern einen gültigen Status', async () => {
  const { res } = await run(richDrive());
  const rules = c.get('DIAG_RULES');
  assert.equal(res.length, rules.length);
  for (const r of res) assert.ok(['ok', 'warn', 'crit', 'unklar', 'missing'].includes(r.status), r.id + ': ' + r.status);
  // die neuen Regeln müssen mit diesen Daten bewerten, nicht "pid-fehlt" melden
  for (const id of ['oil_temp', 'cat_temp', 'stft_bias', 'lambda_closed_loop', 'batt_voltage', 'knock_retard_pid', 'trans_temp', 'fuel_pressure'])
    assert.notEqual(find(res, id).status, 'missing', id);
});

test('gesunde Werte ergeben unauffällige Befunde', async () => {
  const { res } = await run(richDrive());
  for (const id of ['oil_temp', 'cat_temp', 'lambda_closed_loop', 'batt_voltage', 'knock_retard_pid', 'trans_temp'])
    assert.equal(find(res, id).status, 'ok', id + ': ' + (find(res, id).note || find(res, id).text || ''));
});

test('Bordspannung 12,6 V bei laufendem Motor ist kritisch', async () => {
  const { res } = await run(richDrive({ batt: () => 12.6 }));
  assert.equal(find(res, 'batt_voltage').status, 'crit');
});

test('Sprungsonde, die nicht durchschaltet, ist kritisch', async () => {
  const { res } = await run(richDrive({ o2: () => 0.42 + 0.02 * Math.random() }));
  const f = find(res, 'o2_switching');
  assert.equal(f.status, 'crit', f.status + ' ' + (f.note || f.text || JSON.stringify(f.missing)));
});

test('eingefrorene Kurzzeitkorrektur wird gemeldet', async () => {
  const { res } = await run(richDrive({ stft: () => 0.0 }));
  const f = find(res, 'stft_bias');
  assert.equal(f.status, 'warn');
  assert.ok(/still/.test(f.text));
});

test('Katalysator dauerhaft über 900 °C ist kritisch', async () => {
  const { res } = await run(richDrive({ cat: () => 940 }));
  assert.equal(find(res, 'cat_temp').status, 'crit');
});

test('Kraftstoffdruck bricht unter Volllast um 30 % ein', async () => {
  const { res } = await run(richDrive({ fp: (t, wot) => wot ? 280 : 400 }));
  const f = find(res, 'fuel_pressure');
  assert.ok(f.status === 'warn' || f.status === 'crit', f.status + ' ' + (f.note || f.text));
});

test('Dieselregeln werden bei einem Benzinerprofil übersprungen, Benzinregeln beim Diesel', async () => {
  const csv = richDrive();
  const petrol = (await run(csv, 'audi_s5_b85_cgwc')).res;
  const diesel = (await run(csv, 'fallback_diesel_cr_4zyl')).res;
  for (const id of ['dpf_regen', 'egr_plausibility', 'boost_diesel_map', 'maf_diesel_idle'])
    assert.ok(/nur für Dieselmotoren/.test(find(petrol, id).note || ''), id + ' beim Benziner');
  for (const id of ['stft_bias', 'lambda_closed_loop', 'o2_switching', 'knock_retard_pid'])
    assert.ok(/nur für Ottomotoren/.test(find(diesel, id).note || ''), id + ' beim Diesel');
});

test('Leistungsschätzung rechnet beim Diesel mit Dieselkonstanten', async () => {
  const csv = richDrive();
  const p = find((await run(csv, 'audi_s5_b85_cgwc')).res, 'power_estimate');
  const d = find((await run(csv, 'fallback_diesel_cr_4zyl')).res, 'power_estimate');
  const spec = r => (r.extra || []).filter(Boolean).find(x => /spez/.test(x[0]))[1];
  assert.ok(/Otto/.test(spec(p)));
  assert.ok(/Diesel/.test(spec(d)));
});

test('Verbrauch: Kraftstoffzähler und Streckenquelle mit verschiedenen Zeiträumen ergeben keinen Befund', async () => {
  // Kraftstoff die ganze Fahrt, Geschwindigkeit/Strecke nur die ersten 40 %
  const csv = syntheticDrive({ duration: 1000, dt: 1, speed: t => 60, coolant: () => 92,
    extra: t => [['Fuel used', (t * 0.0006).toFixed(4), 'L']] })
    .split('\n').filter((l, i) => i === 0 || !/Vehicle speed/.test(l) || parseFloat(l.split(';')[0].replace(/"/g, '')) - 40000 < 400).join('\n');
  const f = find((await run(csv)).res, 'fuel_econ');
  assert.equal(f.status, 'unklar', f.status + ' ' + (f.note || ''));
  assert.ok(/verschiedene Zeiträume/.test(f.note));
});

test('Neue Regeln Batterie beim Start und Ladedruckaufbau laufen ohne Fehler und liefern einen gültigen Status', async () => {
  const { res } = await run(richDrive());
  for (const id of ['start_voltage', 'boost_spool']) {
    const r = find(res, id);
    assert.ok(r, id + ' vorhanden');
    assert.ok(['ok', 'warn', 'crit', 'unklar', 'missing'].includes(r.status), id + ': ' + r.status);
  }
});
