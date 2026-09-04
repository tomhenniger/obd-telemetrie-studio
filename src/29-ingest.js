/* ============================================================
   Übergabewege für die CSV — Datei, Zwischenablage, URL, Fragment.
   Alles läuft im Browser; nichts wird hochgeladen.
   ============================================================ */

const MAGIC = {
  gzip: u => u.length > 2 && u[0] === 0x1f && u[1] === 0x8b,
  zip:  u => u.length > 4 && u[0] === 0x50 && u[1] === 0x4b && (u[2] === 3 || u[2] === 5 || u[2] === 7),
  zstd: u => u.length > 4 && u[0] === 0x28 && u[1] === 0xb5 && u[2] === 0x2f && u[3] === 0xfd
};

function hasDecompression() { return typeof DecompressionStream === 'function'; }

async function decompress(bytes, format) {
  if (!hasDecompression())
    throw new Error('Dieser Browser kann gepackte Daten nicht entpacken (DecompressionStream fehlt). ' +
                    'Auf dem iPhone braucht es dafür iOS 16.4 oder neuer.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* Minimaler ZIP-Leser: liest das zentrale Verzeichnis und liefert den
   größten enthaltenen Eintrag (Shortcuts „Archiv erstellen“ packt genau eine Datei). */
function zipEntries(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  const from = Math.max(0, u8.length - 65557);
  for (let i = u8.length - 22; i >= from; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Das sieht nach einem ZIP aus, aber das Archiv-Ende fehlt – die Datei ist wohl unvollständig übertragen worden.');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const out = [];
  for (let k = 0; k < count && off + 46 <= u8.length; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method   = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const rawSize  = dv.getUint32(off + 24, true);
    const nameLen  = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const cmtLen   = dv.getUint16(off + 32, true);
    const localOff = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nameLen));
    const lnLen = dv.getUint16(localOff + 26, true);
    const leLen = dv.getUint16(localOff + 28, true);
    const dataOff = localOff + 30 + lnLen + leLen;
    out.push({ name, method, rawSize, data: u8.subarray(dataOff, dataOff + compSize) });
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

async function unzipBest(u8) {
  const entries = zipEntries(u8).filter(e => !/^__MACOSX\//.test(e.name) && !/\/$/.test(e.name));
  if (!entries.length) throw new Error('Das ZIP-Archiv enthält keine lesbare Datei.');
  const pref = entries.filter(e => /\.(csv|txt|log)$/i.test(e.name));
  const pick = (pref.length ? pref : entries).sort((a, b) => b.rawSize - a.rawSize)[0];
  if (pick.method === 0) return { bytes: pick.data, name: pick.name };
  if (pick.method === 8) return { bytes: await decompress(pick.data, 'deflate-raw'), name: pick.name };
  throw new Error('Die Datei im Archiv ist mit einem unbekannten Verfahren gepackt (Methode ' + pick.method + ').');
}

/* Base64 -> Bytes, blockweise damit auch mehrere Megabyte nicht hängen */
function base64ToBytes(str) {
  const clean = str.replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/=]/g, '');
  const bin = atob(clean);
  const n = bin.length, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = bin.charCodeAt(i) & 255;
  return out;
}
function looksBase64(s) {
  if (s.length < 64) return false;
  // Nur Zeilenumbrüche dürfen weg: base64 wird zeilenweise umbrochen, enthält aber
  // niemals Tabs, Semikolons oder Kommas. Ohne diese Einschränkung wird jede
  // Tab-getrennte CSV aus rein alphanumerischen Zellen als base64 fehlgedeutet.
  const head = s.slice(0, 4096).replace(/[\r\n]+/g, '');
  if (/[\t;,. ]/.test(head)) return false;
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(head)) return false;
  const body = s.replace(/[\r\n]+/g, '');
  return body.length % 4 === 0 || /=$/.test(body);
}

/* Der gemeinsame Eingang: nimmt Bytes oder Text und liefert CSV-Text zurück. */
async function toCsvText(input, hint) {
  let bytes = null, text = null;
  if (typeof input === 'string') {
    const t = input.trim();
    if (!t) throw new Error('Es wurde nichts übergeben – die Zwischenablage war leer.');
    if (looksBase64(t)) { try { bytes = base64ToBytes(t); } catch (e) { text = input; } }
    else text = input;
  } else {
    bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  }

  if (bytes) {
    let guard = 0;
    while (guard++ < 3) {
      if (MAGIC.gzip(bytes))      { bytes = await decompress(bytes, 'gzip'); continue; }
      if (MAGIC.zip(bytes))       { const r = await unzipBest(bytes); bytes = r.bytes; hint = hint || r.name; continue; }
      if (MAGIC.zstd(bytes))      throw new Error('Zstandard-Archive kann der Browser nicht entpacken. Bitte als ZIP oder gzip packen.');
      break;
    }
    text = new TextDecoder('utf-8').decode(bytes);
  }

  /* VCDS-Log? Dann erst in eine Wide-CSV übersetzen. */
  if (looksLikeVcds(text)) {
    const v = vcdsToCsv(text);
    return { text: v.text, name: (hint || 'VCDS') + ' · ' + (v.controller || 'Messwertblock'), vcds: v };
  }

  const probe = text.slice(0, 2000);
  if (/^\s*[{[]/.test(probe) || /<html/i.test(probe))
    throw new Error('Der übergebene Inhalt ist keine CSV-Datei, sondern ' +
                    (/<html/i.test(probe) ? 'eine HTML-Seite' : 'JSON') +
                    '. Bei einem Link muss dieser direkt auf die CSV zeigen, nicht auf eine Vorschauseite.');
  if (!/[;,\t|]/.test(probe))
    throw new Error('In den ersten Zeilen kommt kein Trennzeichen vor – das sieht nicht nach einer CSV-Tabelle aus.');
  return { text, name: hint };
}

/* --- Zwischenablage --- */
async function readClipboard() {
  if (!navigator.clipboard || !navigator.clipboard.readText)
    throw new Error('Dieser Browser gibt keinen Zugriff auf die Zwischenablage. Nutze stattdessen das Einfügefeld darunter (langes Tippen → Einsetzen).');
  /* Manche Browser lassen das Versprechen offen, solange die Erlaubnisabfrage steht.
     Ohne Zeitlimit würde die Oberfläche stumm hängen. */
  let txt;
  try {
    txt = await Promise.race([
      navigator.clipboard.readText(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('__timeout__')), 25000))
    ]);
  } catch (e) {
    if (e && e.message === '__timeout__')
      throw new Error('Die Abfrage der Zwischenablage kam nicht zurück – vermutlich wartet noch eine Erlaubnisabfrage des Browsers. ' +
                      'Nimm stattdessen das Einfügefeld auf dem Startbildschirm: hineintippen, langes Tippen, „Einsetzen“.');
    throw new Error('Der Zugriff auf die Zwischenablage wurde abgelehnt oder abgebrochen. ' +
                    'Safari fragt beim Antippen einmal nach – ohne Bestätigung geht es nicht. ' +
                    'Alternativ das Einfügefeld auf dem Startbildschirm benutzen.');
  }
  if (!txt || !txt.trim()) throw new Error('Die Zwischenablage ist leer.');
  return txt;
}

/* --- Von einer URL holen --- */
async function fetchCsv(url, onProgress) {
  let res;
  try { res = await fetch(url, { redirect: 'follow' }); }
  catch (e) {
    throw new Error('Die Adresse konnte nicht geladen werden. Meist blockiert der fremde Server den Zugriff aus dem Browser (fehlender CORS-Header). ' +
                    'Die Datei muss von einem Server kommen, der „Access-Control-Allow-Origin“ setzt.');
  }
  if (!res.ok) throw new Error('Der Server hat mit ' + res.status + ' ' + res.statusText + ' geantwortet.');
  const total = +(res.headers.get('content-length') || 0);
  if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    if (onProgress) onProgress(got / total, got);
  }
  const out = new Uint8Array(got); let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

/* Übergabeparameter aus der Adresse lesen */
function handoffFromUrl() {
  const q = new URLSearchParams(location.search);
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const src = q.get('src') || h.get('src');
  const gz  = q.get('gz')  || h.get('gz') || h.get('data');
  const clip = location.hash === '#clipboard' || location.hash === '#clip' ||
               q.get('from') === 'clipboard' || h.has('clipboard');
  const name = q.get('name') || h.get('name');
  return { src, gz, clip, name };
}
