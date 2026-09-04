const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const ctx = load();
const g = name => ctx.get(name);

const LOG = [
  'Thursday,14,March,2024,19:02:31:12345',
  'VCDS Version: Release 22.3.0 (x64)',
  'Address 01: Engine       Labels: 06E-907-551-CGW.clb',
  ',Group A: 002,,,Group B: 020,,,',
  'TIME ,STAMP ,Engine speed ,Mass air / rev ,Coolant temp. ,STAMP ,Ignition angle ,',
  ' ,       ,/min ,mg/str ,°C , ,°KW ,',
  ',,,,,,,',
  '0.0,STAMP,798,320.5,88.0,STAMP,6.0,',
  '0.5,STAMP,805,318.0,88.5,STAMP,6.8,',
  '1.0,STAMP,1450,410.2,89.0,STAMP,12.0,',
  'TIME ,STAMP ,Engine speed ,',
  '2.0,STAMP,1600,415.0,89.5,STAMP,13.5,'
].join('\r\n');

test('VCDS: Format erkennen, Kanäle mit Einheit übernehmen, STAMP verwerfen', () => {
  assert.equal(g('looksLikeVcds')(LOG), true);
  assert.equal(g('looksLikeVcds')('"SECONDS";"PID";"VALUE"\n"0";"RPM";"800"'), false);
  const v = g('vcdsToCsv')(LOG);
  assert.equal(v.controller, '01 Engine');
  const lines = v.text.trim().split('\n');
  assert.equal(lines[0], '"SECONDS";"Engine speed (/min)";"Mass air / rev (mg/str)";"Coolant temp. (°C)";"Ignition angle (°KW)"');
  assert.equal(v.channels.length, 4);
  assert.equal(lines[1], '0.0;798;320.5;88.0;6.0', 'Zahlen bleiben, wie sie im Log stehen');
  assert.equal(v.rows, 4, 'vier Messzeilen, Blockkopf mittendrin ignoriert');
  assert.equal(lines[4], '2.0;1600;415.0;89.5;13.5');
});

test('VCDS: unbrauchbare Eingaben melden sich verständlich', () => {
  assert.throws(() => g('vcdsToCsv')('VCDS Version: 22\nGroup A: ,\nnur Text\n'), /TIME-Zeile/);
  assert.throws(() => g('vcdsToCsv')('TIME ,STAMP ,Engine speed ,\n ,,/min ,\n'), /keine Messzeilen/);
});
