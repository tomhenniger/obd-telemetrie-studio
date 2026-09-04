const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const ctx = load();
const g = name => ctx.get(name);

test('FIN: Hersteller, Region, Modelljahr; Suche im Text', () => {
  const d = g('decodeVin')('WAUZZZ8T4EA012345');
  assert.equal(d.maker, 'Audi'); assert.equal(d.region, 'Europa'); assert.equal(d.modelYear, 2014);
  assert.equal(g('decodeVin')('WAUZZZ8T4EA01234'), null, '16 Zeichen');
  assert.equal(g('decodeVin')('WAUZZZ8T4EA0I2345'), null, 'I ist verboten');
  const txt = 'SECONDS;PID;VALUE\n0;VIN;WAUZZZ8T4EA012345\n1;Engine RPM;800\n2;VIN;WAUZZZ8T4EA012345\n';
  const f = g('findVin')(txt);
  assert.equal(f.vin, 'WAUZZZ8T4EA012345'); assert.equal(f.hits, 2);
  assert.equal(g('findVin')('12345678901234567 nur Ziffern und ABCDEFGHJKLMNPRST nur Buchstaben'), null);
  assert.equal(g('findVin')(''), null);
});
