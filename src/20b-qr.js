/* ===== QR-Code erzeugen ============================================
   Vollständiger QR-Encoder nach ISO/IEC 18004, Byte-Modus, Versionen
   1 bis 40. Kein Dienst, keine Bibliothek: der Code entsteht im
   Browser, damit ein Link auf Papier oder Bildschirm weitergegeben
   werden kann, ohne dass er irgendwo hochgeladen wird.
   ================================================================== */

/* Zwei kanonische Tabellen statt einer großen: Fehlerkorrektur-Bytes je Block
   und Blockzahl je Version und Stufe. Alles andere folgt daraus rechnerisch –
   das erspart eine 40-zeilige Tabelle, in der sich Tippfehler verstecken. */
const QR_LEVELS = { L: 0, M: 1, Q: 2, H: 3 };
const QR_EC_PER_BLOCK = [
  [7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
  [10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
  [13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
  [17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30]
];
const QR_NUM_BLOCKS = [
  [1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
  [1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
  [1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
  [1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81]
];
const QR_ALIGN = [[], [], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,26,46],
  [6,28,50], [6,30,54], [6,32,58], [6,34,62], [6,26,46,66], [6,26,48,70], [6,26,50,74], [6,30,54,78],
  [6,30,56,82], [6,30,58,86], [6,34,62,90], [6,28,50,72,94], [6,26,50,74,98], [6,30,54,78,102],
  [6,28,54,80,106], [6,32,58,84,110], [6,30,58,86,114], [6,34,62,90,118], [6,26,50,74,98,122],
  [6,30,54,78,102,126], [6,26,52,78,104,130], [6,30,56,82,108,134], [6,34,60,86,112,138],
  [6,30,58,86,114,142], [6,34,62,90,118,146], [6,30,54,78,102,126,150], [6,24,50,76,102,128,154],
  [6,28,54,80,106,132,158], [6,32,58,84,110,136,162], [6,26,54,82,110,138,166], [6,30,58,86,114,142,170]];

/* Rohdatenmodule einer Version: Fläche minus Funktionsmuster */
function qrRawDataModules(v) {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; }
  if (v >= 7) r -= 36;
  return r;
}
function qrTotalCodewords(v) { return Math.floor(qrRawDataModules(v) / 8); }

/* Blockaufteilung: kurze und lange Blöcke ergeben sich aus Gesamtzahl und Blockanzahl */
function qrBlockLayout(version, level) {
  const li = QR_LEVELS[level];
  const ecLen = QR_EC_PER_BLOCK[li][version - 1];
  const numBlocks = QR_NUM_BLOCKS[li][version - 1];
  const dataCw = qrTotalCodewords(version) - ecLen * numBlocks;
  const shortLen = Math.floor(dataCw / numBlocks);
  const numLong = dataCw % numBlocks;
  return { ecLen, numBlocks, shortLen, numLong, dataCw };
}

const QR_FORMAT_BITS = [
  0x77C4,0x72F3,0x7DAA,0x789D,0x662F,0x6318,0x6C41,0x6976,   // L, Masken 0-7
  0x5412,0x5125,0x5E7C,0x5B4B,0x45F9,0x40CE,0x4F97,0x4AA0,   // M
  0x355F,0x3068,0x3F31,0x3A06,0x24B4,0x2183,0x2EDA,0x2BED,   // Q
  0x1689,0x13BE,0x1CE7,0x19D0,0x0762,0x0255,0x0D0C,0x083B];  // H
const QR_VERSION_BITS = [0x07C94,0x085BC,0x09A99,0x0A4D3,0x0BBF6,0x0C762,0x0D847,0x0E60D,0x0F928,0x10B78,
  0x1145D,0x12A17,0x13532,0x149A6,0x15683,0x168C9,0x177EC,0x18EC4,0x191E1,0x1AFAB,0x1B08E,0x1CC1A,0x1D33F,
  0x1ED75,0x1F250,0x209D5,0x216F0,0x228BA,0x2379F,0x24B0B,0x2542E,0x26A64,0x27541,0x28C69];

/* Galois-Feld 256 für Reed-Solomon */
const QR_EXP = new Uint8Array(512), QR_LOG = new Uint8Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) { QR_EXP[i] = x; QR_LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
  for (let i = 255; i < 512; i++) QR_EXP[i] = QR_EXP[i - 255];
})();
function qrMul(a, b) { return a && b ? QR_EXP[QR_LOG[a] + QR_LOG[b]] : 0; }
function qrRsPoly(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    /* poly × (x + α^i): erst um eine Stelle schieben, dann mit α^i gewichtet addieren */
    for (let j = 0; j < poly.length; j++) { next[j] ^= poly[j]; next[j + 1] ^= qrMul(poly[j], QR_EXP[i]); }
    poly = next;
  }
  return poly;
}
function qrRsEncode(data, ecLen) {
  const gen = qrRsPoly(ecLen), res = new Uint8Array(data.length + ecLen);
  res.set(data);
  for (let i = 0; i < data.length; i++) {
    const factor = res[i]; if (!factor) continue;
    for (let j = 0; j < gen.length; j++) res[i + j] ^= qrMul(gen[j], factor);
  }
  return res.slice(data.length);
}

function qrCapacity(version, level) { return qrBlockLayout(version, level).dataCw; }
/* Kleinste Version, in die der Text passt */
function qrPickVersion(byteLen, level) {
  for (let v = 1; v <= 40; v++) {
    const cci = v < 10 ? 8 : 16;
    const bits = 4 + cci + byteLen * 8;
    if (bits <= qrCapacity(v, level) * 8) return v;
  }
  return 0;
}

function qrEncodeData(bytes, version, level) {
  const cci = version < 10 ? 8 : 16;
  const cap = qrCapacity(version, level);
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4);                       // Byte-Modus
  push(bytes.length, cci);
  for (const b of bytes) push(b, 8);
  const capBits = cap * 8;
  for (let i = 0; i < 4 && bits.length < capBits; i++) bits.push(0);      // Abschluss
  while (bits.length % 8) bits.push(0);
  const data = new Uint8Array(cap);
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0; for (let k = 0; k < 8; k++) b = (b << 1) | (bits[i + k] || 0);
    data[i / 8] = b;
  }
  const pad = [0xEC, 0x11];
  for (let i = Math.ceil(bits.length / 8), k = 0; i < cap; i++, k++) data[i] = pad[k % 2];

  /* Blöcke bilden, Fehlerkorrektur je Block, dann verschränken */
  const L = qrBlockLayout(version, level);
  const ecLen = L.ecLen, blocks = [], ecs = [];
  let pos = 0;
  for (let i = 0; i < L.numBlocks; i++) {
    const len = L.shortLen + (i >= L.numBlocks - L.numLong ? 1 : 0);
    const b = data.slice(pos, pos + len); pos += len;
    blocks.push(b); ecs.push(qrRsEncode(b, ecLen));
  }
  const out = [];
  const maxData = L.shortLen + (L.numLong ? 1 : 0);
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecLen; i++) for (const b of ecs) out.push(b[i]);
  return out;
}

function qrBuildMatrix(version, level, codewords, mask) {
  const size = version * 4 + 17;
  const m = [], reserved = [];
  for (let i = 0; i < size; i++) { m.push(new Uint8Array(size)); reserved.push(new Uint8Array(size)); }
  const setF = (r, c, v) => { if (r >= 0 && c >= 0 && r < size && c < size) { m[r][c] = v; reserved[r][c] = 1; } };
  /* Suchmuster mit Trennlinie */
  const finder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const inner = r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
        (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      setF(r0 + r, c0 + c, inner ? 1 : 0);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  /* Taktmuster */
  for (let i = 8; i < size - 8; i++) { setF(6, i, i % 2 === 0 ? 1 : 0); setF(i, 6, i % 2 === 0 ? 1 : 0); }
  /* Ausrichtungsmuster */
  const al = QR_ALIGN[version];
  for (const r of al) for (const c of al) {
    if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
      setF(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0);
  }
  setF(size - 8, 8, 1);                                   // dunkles Modul
  /* Formatbereiche reservieren */
  for (let i = 0; i < 9; i++) { if (!reserved[8][i]) setF(8, i, 0); if (!reserved[i][8]) setF(i, 8, 0); }
  for (let i = 0; i < 8; i++) { if (!reserved[8][size - 1 - i]) setF(8, size - 1 - i, 0); if (!reserved[size - 1 - i][8]) setF(size - 1 - i, 8, 0); }
  if (version >= 7) for (let i = 0; i < 18; i++) { const r = Math.floor(i / 3), c = i % 3; setF(size - 11 + c, r, 0); setF(r, size - 11 + c, 0); }

  /* Daten einweben, von rechts unten im Zickzack */
  const maskFn = [
    (r, c) => (r + c) % 2 === 0, (r, c) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0, (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0
  ][mask];
  let bit = 0, upward = true;                        // Richtung wechselt je Spaltenpaar
  const total = codewords.length * 8;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;                            // die senkrechte Taktspalte wird übersprungen
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (let k = 0; k < 2; k++) {
        const c = col - k;
        if (reserved[row][c]) continue;
        let v = 0;
        if (bit < total) { v = (codewords[bit >> 3] >> (7 - (bit & 7))) & 1; bit++; }
        m[row][c] = maskFn(row, c) ? v ^ 1 : v;
      }
    }
    upward = !upward;
  }
  /* Formatinformation */
  const fmt = QR_FORMAT_BITS[QR_LEVELS[level] * 8 + mask];
  for (let i = 0; i < 15; i++) {
    const v = (fmt >> i) & 1;
    /* senkrechte Kopie links neben dem oberen Suchmuster, waagerechte darunter */
    if (i < 6) m[i][8] = v;
    else if (i < 8) m[i + 1][8] = v;
    else m[size - 15 + i][8] = v;
    if (i < 8) m[8][size - 1 - i] = v;
    else if (i === 8) m[8][7] = v;
    else m[8][14 - i] = v;
  }
  m[size - 8][8] = 1;
  /* Versionsinformation ab Version 7 */
  if (version >= 7) {
    const vb = QR_VERSION_BITS[version - 7];
    for (let i = 0; i < 18; i++) {
      const v = (vb >> i) & 1, r = Math.floor(i / 3), c = i % 3;
      m[size - 11 + c][r] = v; m[r][size - 11 + c] = v;
    }
  }
  return m;
}

/* Strafpunkte nach Norm – die Maske mit den wenigsten gewinnt */
function qrPenalty(m) {
  const n = m.length; let p = 0;
  const run = get => {
    for (let a = 0; a < n; a++) {
      let last = -1, len = 0;
      for (let b = 0; b < n; b++) {
        const v = get(a, b);
        if (v === last) { len++; if (len === 5) p += 3; else if (len > 5) p += 1; }
        else { last = v; len = 1; }
      }
    }
  };
  run((a, b) => m[a][b]); run((a, b) => m[b][a]);
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++)
    if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) p += 3;
  const pat = [1,0,1,1,1,0,1,0,0,0,0], pat2 = [0,0,0,0,1,0,1,1,1,0,1];
  const hit = read => {                                   // read(i) liefert das i-te Modul der Elfergruppe
    let ok1 = true, ok2 = true;
    for (let i = 0; i < 11; i++) { const v = read(i); if (v !== pat[i]) ok1 = false; if (v !== pat2[i]) ok2 = false; }
    return ok1 || ok2;
  };
  for (let r = 0; r < n; r++) for (let c = 0; c + 10 < n; c++) if (hit(i => m[r][c + i])) p += 40;
  for (let c = 0; c < n; c++) for (let r = 0; r + 10 < n; r++) if (hit(i => m[r + i][c])) p += 40;
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dark += m[r][c];
  p += Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5) * 10;
  return p;
}

/* Hauptfunktion: Text → Matrix aus 0/1 */
function qrEncode(text, level) {
  level = level || 'L';
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  const version = qrPickVersion(bytes.length, level);
  if (!version) throw new Error('Der Inhalt ist zu lang für einen QR-Code (' + bytes.length + ' Bytes, höchstens ' + qrCapacity(40, level) + ').');
  const cw = qrEncodeData(bytes, version, level);
  let best = null, bestP = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = qrBuildMatrix(version, level, cw, mask);
    const p = qrPenalty(m);
    if (p < bestP) { bestP = p; best = m; }
  }
  return { matrix: best, version, level, size: best.length, bytes: bytes.length };
}

/* Matrix als SVG – druckbar und beliebig skalierbar */
function qrSvg(text, opts) {
  opts = opts || {};
  const q = qrEncode(text, opts.level || 'L');
  const quiet = opts.quiet === undefined ? 4 : opts.quiet;
  const n = q.size + quiet * 2;
  const parts = [];
  for (let r = 0; r < q.size; r++) {
    let c = 0;
    while (c < q.size) {
      if (!q.matrix[r][c]) { c++; continue; }
      let len = 0;
      while (c + len < q.size && q.matrix[r][c + len]) len++;
      parts.push('M' + (c + quiet) + ' ' + (r + quiet) + 'h' + len + 'v1h-' + len + 'z');
      c += len;
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" width="' + (opts.px || 160) + '" height="' + (opts.px || 160) + '" shape-rendering="crispEdges" role="img" aria-label="QR-Code">' +
    '<rect width="' + n + '" height="' + n + '" fill="' + (opts.bg || '#ffffff') + '"/>' +
    '<path d="' + parts.join('') + '" fill="' + (opts.fg || '#000000') + '"/></svg>';
}
