/* ===== Schaltanalyse ===============================================
   Aus der Gangzuordnung je Rasterpunkt werden Schaltvorgänge abgeleitet:
   Drehzahl beim Hoch- und Runterschalten, Schaltdauer (unzugeordnete
   Punkte zwischen zwei Gängen), Zeitanteil je Gang, Kickdowns.
   Erwartet gears = { assign (Gangindex je Rasterpunkt oder -1),
   remap (Index → Gangnummer), gears ([{ gear, label }]) }.
   ================================================================== */

function shiftAnalysis(ds, gears, opts) {
  opts = opts || {};
  const out = { ok: false, shifts: [], up: [], down: [], perGear: [], kickdowns: 0, durMedian: NaN, n: 0 };
  if (!ds || !gears || !gears.assign || !ds.G || !ds.G.rpm) { out.reason = 'Ohne Gangzuordnung und Drehzahl gibt es keine Schaltanalyse.'; return out; }
  const grid = ds.grid, N = grid.length, step = N > 1 ? grid[1] - grid[0] : 1;
  const rpm = ds.G.rpm, spd = ds.G.speed_mix || ds.G.speed || ds.G.speed_gps, pedal = ds.G.pedal || ds.G.load_abs || null, acc = ds.G.accel || null;
  const assign = gears.assign, remap = gears.remap || {};
  /* remap ist ein Objekt {Index: Gangnummer}; die Rückrichtung brauchen wir für Label und Statistik */
  const idxOf = {}; Object.keys(remap).forEach(i => { idxOf[remap[i]] = +i; });
  const indexOfGear = gn => (idxOf[gn] !== undefined ? idxOf[gn] : gn - 1);
  const gearNo = gi => (gi >= 0 ? (remap[gi] !== undefined ? remap[gi] : gi + 1) : null);
  const label = gi => { const g = gearNo(gi); const e = (gears.gears || []).find(x => x.gear === g); return e && e.label ? e.label : (g === null ? '–' : String(g)); };
  const minHold = Math.max(2, Math.round(2 / step));            // ein Gang muss 2 s stehen, sonst ist es Zuordnungsrauschen

  /* Zusammenhängende Gangblöcke */
  const blocks = [];
  let k = 0;
  while (k < N) {
    const gi = assign[k];
    if (gi < 0) { k++; continue; }
    let j = k; while (j < N && assign[j] === gi) j++;
    blocks.push({ gi, k0: k, k1: j - 1, len: j - k });
    k = j;
  }
  /* Zeitanteil je Gang (nur in Fahrt) */
  const time = new Map();
  for (const b of blocks) { const g = gearNo(b.gi); time.set(g, (time.get(g) || 0) + b.len * step); }
  const totalMoving = Array.from(time.values()).reduce((p, q) => p + q, 0);
  out.perGear = Array.from(time.entries()).sort((a, b) => a[0] - b[0]).map(([g, t]) => {
    const gi = indexOfGear(g);
    let vMin = Infinity, vMax = -Infinity, rSum = 0, rN = 0;
    for (let i = 0; i < N; i++) if (assign[i] === gi) { const v = spd ? spd[i] : NaN; if (v === v) { if (v < vMin) vMin = v; if (v > vMax) vMax = v; } if (rpm[i] === rpm[i]) { rSum += rpm[i]; rN++; } }
    return { gear: g, label: label(gi), time: t, share: totalMoving ? t / totalMoving : 0, vMin: isFinite(vMin) ? vMin : NaN, vMax: isFinite(vMax) ? vMax : NaN, rpmMean: rN ? rSum / rN : NaN };
  });

  /* Schaltvorgänge zwischen stabilen Blöcken */
  const med = arr => { if (!arr.length) return NaN; const s = arr.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  const durs = [];
  for (let b = 1; b < blocks.length; b++) {
    const A = blocks[b - 1], B = blocks[b];
    if (A.len < minHold || B.len < minHold || A.gi === B.gi) continue;
    const gap = B.k0 - A.k1 - 1;                               // unzugeordnete Punkte = Schaltpause
    if (gap * step > 4) continue;                              // zu lange Lücke: kein Schaltvorgang, sondern Rollen/Stopp
    const from = gearNo(A.gi), to = gearNo(B.gi);
    if (from === null || to === null || Math.abs(to - from) > 3) continue;
    const before = [], after = [];
    for (let i = Math.max(A.k0, A.k1 - Math.round(1.5 / step)); i <= A.k1; i++) if (rpm[i] === rpm[i]) before.push(rpm[i]);
    for (let i = B.k0; i <= Math.min(B.k1, B.k0 + Math.round(1.5 / step)); i++) if (rpm[i] === rpm[i]) after.push(rpm[i]);
    const v = spd ? spd[B.k0] : NaN;
    let ped = NaN, a = NaN;                                   // Pedal und Beschleunigung im Fenster um den Wechsel
    if (pedal) { let mx = -Infinity; for (let i = Math.max(0, A.k1 - Math.round(1 / step)); i <= Math.min(N - 1, B.k0 + Math.round(1 / step)); i++) if (pedal[i] > mx) mx = pedal[i]; ped = isFinite(mx) ? mx : NaN; }
    if (acc) { let mx = -Infinity; for (let i = B.k0; i <= Math.min(N - 1, B.k0 + Math.round(2 / step)); i++) if (acc[i] > mx) mx = acc[i]; a = isFinite(mx) ? mx : NaN; }
    const sh = { t: grid[A.k1], from, to, up: to > from, rpmBefore: med(before), rpmAfter: med(after), speed: v, pedal: ped, dur: gap * step,
                 kick: to < from && ((ped === ped && ped > 75) || (a === a && a > 0.12)) };
    out.shifts.push(sh); durs.push(sh.dur);
    if (sh.kick) out.kickdowns++;
  }
  out.n = out.shifts.length;
  out.durMedian = med(durs);
  const group = (list, key) => {
    const m = new Map();
    for (const s of list) { const kk = key(s); let e = m.get(kk); if (!e) { e = { key: kk, from: s.from, to: s.to, n: 0, rpmB: [], rpmA: [], v: [], ped: [] }; m.set(kk, e); }
      e.n++; if (s.rpmBefore === s.rpmBefore) e.rpmB.push(s.rpmBefore); if (s.rpmAfter === s.rpmAfter) e.rpmA.push(s.rpmAfter); if (s.speed === s.speed) e.v.push(s.speed); if (s.pedal === s.pedal) e.ped.push(s.pedal); }
    return Array.from(m.values()).sort((a, b) => a.from - b.from || a.to - b.to).map(e => ({ from: e.from, to: e.to, n: e.n,
      rpmMed: med(e.rpmB), rpmMin: e.rpmB.length ? Math.min(...e.rpmB) : NaN, rpmMax: e.rpmB.length ? Math.max(...e.rpmB) : NaN,
      rpmAfter: med(e.rpmA), vMed: med(e.v), pedMed: med(e.ped), drop: med(e.rpmB) - med(e.rpmA) }));
  };
  out.up = group(out.shifts.filter(s => s.up), s => s.from + '>' + s.to);
  out.down = group(out.shifts.filter(s => !s.up), s => s.from + '>' + s.to);
  out.labelOf = g => label(indexOfGear(g));
  out.ok = out.n >= 3 && out.perGear.length >= 2;
  if (!out.ok) out.reason = out.perGear.length < 2 ? 'Weniger als zwei Gänge zugeordnet.' : 'Weniger als drei saubere Schaltvorgänge erkannt.';
  return out;
}
