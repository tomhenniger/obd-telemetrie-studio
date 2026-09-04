/* ===== Live-Verbindung zum ELM327 (Web Bluetooth) ==================
   Liest einen BLE-Adapter direkt aus dem Browser: verbinden, PIDs im
   Wechsel abfragen, Werte anzeigen und als CSV mitschreiben, die
   anschließend in dieselbe Auswertung läuft wie eine Datei.

   Web Bluetooth gibt es in Chrome und Edge (Desktop und Android), nicht
   in Safari. Klassische Bluetooth-Adapter (SPP) sind nicht erreichbar –
   nur BLE-Adapter mit dem üblichen Nordic-UART-Dienst.
   ================================================================== */

const LIVE_UART = {
  service: '0000fff0-0000-1000-8000-00805f9b34fb',            // gängig bei ELM327-BLE-Klonen
  alt: [
    { service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', tx: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', rx: '6e400003-b5a3-f393-e0a9-e50e24dcca9e' },
    { service: '0000ffe0-0000-1000-8000-00805f9b34fb', tx: '0000ffe1-0000-1000-8000-00805f9b34fb', rx: '0000ffe1-0000-1000-8000-00805f9b34fb' },
    { service: '0000fff0-0000-1000-8000-00805f9b34fb', tx: '0000fff2-0000-1000-8000-00805f9b34fb', rx: '0000fff1-0000-1000-8000-00805f9b34fb' }
  ]
};

/* Die PIDs, die live abgefragt werden. Reihenfolge = Abfragereihenfolge. */
const LIVE_PIDS = [
  { pid: '010C', name: 'Engine RPM',                 unit: 'rpm',    bytes: 2, calc: (a, b) => (a * 256 + b) / 4 },
  { pid: '010D', name: 'Vehicle speed',              unit: 'km/h',   bytes: 1, calc: a => a },
  { pid: '0105', name: 'Engine coolant temperature', unit: '°C',     bytes: 1, calc: a => a - 40 },
  { pid: '0104', name: 'Calculated engine load',     unit: '%',      bytes: 1, calc: a => a * 100 / 255 },
  { pid: '0143', name: 'Absolute load value',        unit: '%',      bytes: 2, calc: (a, b) => (a * 256 + b) * 100 / 255 },
  { pid: '010F', name: 'Intake air temperature',     unit: '°C',     bytes: 1, calc: a => a - 40 },
  { pid: '010B', name: 'Intake manifold absolute pressure', unit: 'kPa', bytes: 1, calc: a => a },
  { pid: '0110', name: 'Mass air flow rate',         unit: 'g/s',    bytes: 2, calc: (a, b) => (a * 256 + b) / 100 },
  { pid: '010E', name: 'Timing advance',             unit: '°',      bytes: 1, calc: a => a / 2 - 64 },
  { pid: '0106', name: 'Short term fuel % trim - Bank 1', unit: '%', bytes: 1, calc: a => a * 100 / 128 - 100 },
  { pid: '0107', name: 'Long term fuel % trim - Bank 1',  unit: '%', bytes: 1, calc: a => a * 100 / 128 - 100 },
  { pid: '0142', name: 'Control module voltage',     unit: 'V',      bytes: 2, calc: (a, b) => (a * 256 + b) / 1000 },
  { pid: '0111', name: 'Throttle position',          unit: '%',      bytes: 1, calc: a => a * 100 / 255 },
  { pid: '015C', name: 'Engine oil temperature',     unit: '°C',     bytes: 1, calc: a => a - 40 }
];

/* Antwort des Adapters in einen Messwert übersetzen: "41 0C 1A F8" → 1726 rpm */
function parseObdResponse(raw, def) {
  /* Adapter antworten mal mit, mal ohne Leerzeichen und oft mit Vorspann
     ("SEARCHING...", echoter Befehl). Erst die Wörter nehmen, die vollständig
     aus Hexziffern bestehen – „SEARCHING“ fällt so heraus, obwohl darin
     E, A und C stehen –, dann zu Bytes zusammensetzen. */
  const words = String(raw || '').toUpperCase().split(/[^0-9A-F]+/).filter(w => w.length && w.length % 2 === 0);
  const clean = words.join('');
  if (clean.length < 6) return NaN;
  const hex = [];
  for (let i = 0; i + 1 < clean.length; i += 2) hex.push(clean.slice(i, i + 2));
  const wantMode = (parseInt(def.pid.slice(0, 2), 16) + 0x40).toString(16).toUpperCase().padStart(2, '0');
  const wantPid = def.pid.slice(2, 4);
  let i = -1;
  for (let k = 0; k + 1 < hex.length; k++) if (hex[k] === wantMode && hex[k + 1] === wantPid) { i = k; break; }
  if (i < 0) return NaN;
  const data = hex.slice(i + 2, i + 2 + def.bytes).map(h => parseInt(h, 16));
  if (data.length < def.bytes || data.some(v => !isFinite(v))) return NaN;
  const v = def.calc.apply(null, data);
  return isFinite(v) ? v : NaN;
}

/* Aufzeichnung im Long-Format aufbauen – dasselbe Format wie Car Scanner */
function liveRecorder() {
  const rows = [];
  const t0 = Date.now();
  return {
    t0,
    add(def, value, pos) {
      const t = (Date.now() - t0) / 1000;
      rows.push('"' + t.toFixed(2) + '";"' + def.name + '";"' + (Math.round(value * 1000) / 1000) + '";"' + def.unit + '";"' +
                (pos && isFinite(pos.lat) ? pos.lat.toFixed(7) : '') + '";"' + (pos && isFinite(pos.lon) ? pos.lon.toFixed(7) : '') + '";');
    },
    get count() { return rows.length; },
    get seconds() { return (Date.now() - t0) / 1000; },
    toCsv() {
      return '"SECONDS";"PID";"VALUE";"UNITS";"LATITUDE";"LONGTITUDE";\n' + rows.join('\n') + '\n';
    }
  };
}

function liveSupported() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

/* Verbindung zum Adapter: verbinden, Zeilen senden und empfangen */
class ObdLink {
  constructor() { this.device = null; this.tx = null; this.rx = null; this.buf = ''; this.waiting = null; this.onLine = null; }
  async connect() {
    if (!liveSupported()) throw new Error('Dieser Browser kann kein Bluetooth. Web Bluetooth gibt es in Chrome und Edge, auf dem iPhone nicht.');
    this.device = await navigator.bluetooth.requestDevice({
      filters: LIVE_UART.alt.map(a => ({ services: [a.service] })),
      optionalServices: LIVE_UART.alt.map(a => a.service)
    });
    const server = await this.device.gatt.connect();
    let last = null;
    for (const a of LIVE_UART.alt) {
      try {
        const svc = await server.getPrimaryService(a.service);
        this.tx = await svc.getCharacteristic(a.tx);
        this.rx = await svc.getCharacteristic(a.rx);
        break;
      } catch (e) { last = e; }
    }
    if (!this.tx || !this.rx) throw new Error('Auf dem Adapter wurde kein bekannter Datendienst gefunden' + (last ? ' (' + last.message + ')' : '') + '.');
    await this.rx.startNotifications();
    this.rx.addEventListener('characteristicvaluechanged', e => this._onData(e.target.value));
    this.device.addEventListener('gattserverdisconnected', () => { if (this.onDisconnect) this.onDisconnect(); });
    /* ELM327 in einen berechenbaren Zustand bringen */
    for (const cmd of ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0']) { await this.send(cmd, 2500).catch(() => {}); }
    return this.device.name || 'Adapter';
  }
  _onData(dv) {
    let s = '';
    for (let i = 0; i < dv.byteLength; i++) s += String.fromCharCode(dv.getUint8(i));
    this.buf += s;
    if (this.buf.indexOf('>') >= 0) {
      const line = this.buf.slice(0, this.buf.indexOf('>')).replace(/[\r\n]+/g, ' ').trim();
      this.buf = this.buf.slice(this.buf.indexOf('>') + 1);
      if (this.onLine) this.onLine(line);
      if (this.waiting) { const w = this.waiting; this.waiting = null; clearTimeout(w.timer); w.resolve(line); }
    }
  }
  send(cmd, timeoutMs) {
    if (!this.tx) return Promise.reject(new Error('Nicht verbunden.'));
    const data = new TextEncoder().encode(cmd + '\r');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiting = null; reject(new Error('Der Adapter hat auf „' + cmd + '“ nicht geantwortet.')); }, timeoutMs || 1500);
      this.waiting = { resolve, timer };
      const write = this.tx.writeValueWithoutResponse ? this.tx.writeValueWithoutResponse(data) : this.tx.writeValue(data);
      write.catch(err => { clearTimeout(timer); this.waiting = null; reject(err); });
    });
  }
  async disconnect() {
    try { if (this.device && this.device.gatt.connected) this.device.gatt.disconnect(); } catch (e) {}
    this.tx = this.rx = null;
  }
}
