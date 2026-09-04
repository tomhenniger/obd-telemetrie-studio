const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');
const ctx = load();
const g = name => ctx.get(name);
const pidDef = p => g('LIVE_PIDS').find(d => d.pid === p);

test('OBD-Antworten auswerten: Drehzahl, Temperaturen, Trims, Spannung', () => {
  const P = g('parseObdResponse');
  assert.equal(P('41 0C 1A F8', pidDef('010C')), 1726, 'Drehzahl (A*256+B)/4');
  assert.equal(P('410C1AF8', pidDef('010C')), 1726, 'ohne Leerzeichen');
  assert.equal(P('41 0D 50', pidDef('010D')), 80, 'Geschwindigkeit');
  assert.equal(P('41 05 7B', pidDef('0105')), 83, 'Kühlmittel A-40');
  assert.equal(P('41 0E 80', pidDef('010E')), 0, 'Zündwinkel A/2-64');
  assert.equal(P('41 07 80', pidDef('0107')), 0, 'LTFT Mitte');
  assert.ok(Math.abs(P('41 07 8C', pidDef('0107')) - 9.375) < 0.001, 'LTFT positiv');
  assert.ok(Math.abs(P('41 42 37 D8', pidDef('0142')) - 14.296) < 0.001, 'Bordspannung');
  /* Störtext davor, echoter Befehl, mehrzeilige Antwort */
  assert.equal(P('SEARCHING... 41 0C 1A F8', pidDef('010C')), 1726);
  assert.equal(P('010C 41 0C 0C 80', pidDef('010C')), 800, 'echoter Befehl stört nicht');
  /* Fehlerfälle */
  assert.ok(!isFinite(P('NO DATA', pidDef('010C'))));
  assert.ok(!isFinite(P('41 0D 50', pidDef('010C'))), 'andere PID zählt nicht');
  assert.ok(!isFinite(P('41 0C 1A', pidDef('010C'))), 'zu wenige Bytes');
  assert.ok(!isFinite(P('', pidDef('010C'))));
});

test('Aufzeichnung im Long-Format mit Position', () => {
  const rec = g('liveRecorder')();
  rec.add(pidDef('010C'), 1726.4444, { lat: 53.1234567, lon: 10.7654321 });
  rec.add(pidDef('0105'), 83, null);
  assert.equal(rec.count, 2);
  const lines = rec.toCsv().trim().split('\n');
  assert.equal(lines[0], '"SECONDS";"PID";"VALUE";"UNITS";"LATITUDE";"LONGTITUDE";');
  assert.match(lines[1], /^"\d+\.\d\d";"Engine RPM";"1726\.444";"rpm";"53\.1234567";"10\.7654321";$/);
  assert.match(lines[2], /"Engine coolant temperature";"83";"°C";"";"";$/);
});

test('PID-Liste ist konsistent', () => {
  const pids = g('LIVE_PIDS');
  assert.ok(pids.length >= 10);
  const seen = new Set();
  pids.forEach(d => {
    assert.match(d.pid, /^01[0-9A-F]{2}$/, d.pid);
    assert.ok(!seen.has(d.pid), 'keine Dopplung: ' + d.pid); seen.add(d.pid);
    assert.ok(d.bytes === 1 || d.bytes === 2);
    assert.equal(typeof d.calc, 'function');
    assert.ok(d.name && d.unit !== undefined);
  });
});
