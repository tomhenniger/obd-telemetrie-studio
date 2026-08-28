/* ---------------------------------------------------------------------------
   Getriebe: Werksübersetzungen, eigene Eingabe, oder nur die Gangzahl.

   Warum überhaupt: das Werkzeug misst die tatsächlich gefahrenen Übersetzungen
   sehr genau — aber es kann nicht wissen, WELCHE Gangnummern das sind. Ein Gang,
   der in der Fahrt nicht benutzt wurde, hinterlässt keine Spur; beim Anfahren
   schleift die Kupplung und liefert gar kein festes Verhältnis. Wer weiß, dass
   sein Getriebe sieben Gänge hat, bekommt hier deshalb echte Gangnummern statt
   einer Nummerierung nach Übersetzung — und die Angabe, welcher Gang fehlt.

   Das Getriebe kommt NICHT aus dem Motorprofil: denselben Motor gibt es mit
   Handschalter, Wandler und Doppelkupplung, und derselbe Getriebetyp läuft je
   Modell mit verschiedenen Achsantrieben. Es ist eine eigene Angabe.

   Grundformel, überall in dieser Datei:
       km/h je 1000 min⁻¹ = 60 · Abrollumfang[m] / (Getriebeübersetzung · Achsantrieb)
--------------------------------------------------------------------------- */

const GEARBOX_MODES = [
  { id: '',        label: 'keine Angabe – nach Übersetzung nummerieren' },
  { id: 'catalog', label: 'Getriebe aus dem Katalog wählen' },
  { id: 'manual',  label: 'Übersetzungen selbst eintragen' },
  { id: 'count',   label: 'nur die Anzahl der Gänge angeben' }
];

/* Werksübersetzungen. Jeder Eintrag trägt seine Quelle und eine Konfidenz —
   ein geratener Wert wäre hier schädlicher als eine Lücke. */
const GEARBOXES = [];

function gearboxById(id) { return GEARBOXES.find(g => g.id === id) || null; }

/* Die gespeicherte Getriebeangabe. Bewusst nicht Teil des Motorprofils. */
function gearboxSetting() {
  const s = store.get('gearbox', null);
  if (!s || typeof s !== 'object' || !s.mode) return null;
  return s;
}
function setGearboxSetting(s) {
  if (!s || !s.mode) store.del('gearbox'); else store.set('gearbox', s);
}

/* Übersetzung je Gang -> km/h je 1000 min⁻¹, unter Berücksichtigung getrennter
   Achsantriebe je Teilgetriebe (bei Doppelkupplungsgetrieben die Regel). */
function gearboxTable(gb, rollCircum) {
  if (!gb || !gb.ratios || !gb.ratios.length || !(rollCircum > 0)) return null;
  const out = [];
  for (let i = 0; i < gb.ratios.length; i++) {
    const gear = i + 1;
    const g = gb.ratios[i];
    if (!(g > 0)) continue;
    let f = gb.final;
    if (gb.final2 && gb.final2Gears && gb.final2Gears.indexOf(gear) >= 0) f = gb.final2;
    if (!(f > 0)) continue;
    out.push({ gear, ratio: g, final: f, total: g * f, kmhPer1000: 60 * rollCircum / (g * f) });
  }
  return out.length ? out : null;
}

/* Die aktuell gültige Getriebeangabe, aufgelöst zu dem, was die Auswertung braucht.
   Rückgabe: null, oder { kind, gears, table|null, firstGear|null, label, quelle } */
function resolveGearbox(profile, rollCircum) {
  const s = gearboxSetting();
  if (!s) return null;
  if (s.mode === 'catalog') {
    const gb = gearboxById(s.id);
    if (!gb) return null;
    const fin = s.final > 0 ? s.final : gb.final;
    const eff = Object.assign({}, gb, { final: fin });
    const table = gearboxTable(eff, rollCircum);
    return { kind: 'catalog', gears: gb.gears, table, firstGear: null,
             label: gb.kennung + ' · ' + gb.name, quelle: gb.quelle || '',
             confidence: gb.confidence || 'mittel',
             finalUser: s.final > 0 && s.final !== gb.final ? s.final : null };
  }
  if (s.mode === 'manual') {
    const ratios = (s.ratios || []).map(Number).filter(v => v > 0);
    if (!ratios.length || !(s.final > 0)) {
      return s.gears > 1 ? { kind: 'count', gears: s.gears | 0, table: null,
                             firstGear: s.firstGear || null, label: 'eigene Angabe', quelle: '' } : null;
    }
    const table = gearboxTable({ ratios, final: s.final, final2: s.final2, final2Gears: s.final2Gears }, rollCircum);
    return { kind: 'manual', gears: ratios.length, table, firstGear: null,
             label: 'eigene Übersetzungen', quelle: 'selbst eingetragen', confidence: 'eigenangabe' };
  }
  if (s.mode === 'count' && s.gears > 1)
    return { kind: 'count', gears: s.gears | 0, table: null, firstGear: s.firstGear || null,
             label: s.gears + '-Gang-Getriebe', quelle: 'eigene Angabe' };
  return null;
}

/* Gemessene Cluster den Werksgängen zuordnen.

   Die gemessenen Übersetzungen sind aufsteigend sortiert und müssen auf eine
   aufsteigende Teilfolge der Gänge abgebildet werden — ein Gang kann fehlen
   (nicht gefahren), aber die Reihenfolge kann sich nicht umkehren. Bei höchstens
   zehn Gängen ist das kleine Suchproblem exakt lösbar; eine gierige Zuordnung
   würde bei einem fehlenden mittleren Gang alles danach verschieben. */
function matchGearsToTable(measuredKmh, table) {
  const m = measuredKmh.length, n = table.length;
  if (!m || !n || m > n) return null;
  const lm = measuredKmh.map(Math.log), lt = table.map(t => Math.log(t.kmhPer1000));
  let best = null;
  const pick = new Array(m);
  (function walk(mi, ti, cost) {
    if (best && cost >= best.cost) return;          // kann nicht mehr besser werden
    if (mi === m) { best = { cost, idx: pick.slice() }; return; }
    if (n - ti < m - mi) return;                    // nicht mehr genug Gänge übrig
    for (let t = ti; t <= n - (m - mi); t++) {
      const d = lm[mi] - lt[t];
      pick[mi] = t;
      walk(mi + 1, t + 1, cost + d * d);
    }
  })(0, 0, 0);
  if (!best) return null;
  // Zuordnung nur annehmen, wenn sie auch passt. 9 % ist grosszügig genug für
  // einen abweichenden Achsantrieb oder eine andere Reifengroesse, aber eng
  // genug, um eine falsche Getriebewahl auffallen zu lassen.
  const dev = best.idx.map((t, i) => measuredKmh[i] / table[t].kmhPer1000 - 1);
  const worst = dev.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
  return { idx: best.idx, dev, worst, ok: worst <= 0.09 };
}

/* Ohne Werksübersetzungen bleibt nur die Gangzahl. Dann ist offen, ob der
   kürzeste gemessene Gang der erste ist — beim Anfahren schleift die Kupplung,
   der erste Gang hinterlässt oft gar kein festes Verhältnis. Aus der Drehzahl-
   grenze lässt sich das aber abschätzen: ein erster Gang ist so ausgelegt, dass
   er am Begrenzer etwa 45–75 km/h erreicht. */
function suggestFirstGear(lowestKmhPer1000, redline, gears, measuredCount) {
  const maxOffset = Math.max(1, gears - measuredCount + 1);
  if (!(lowestKmhPer1000 > 0) || !(redline > 0)) return 1;
  const vAtRedline = lowestKmhPer1000 * redline / 1000;
  let g = 1;
  if (vAtRedline > 135) g = 3;
  else if (vAtRedline > 80) g = 2;
  return Math.min(g, maxOffset);
}

/* Gangnummern an das Ergebnis von computeGears heften.
   Verändert `gears` in place und liefert die Zusatzinformationen fürs UI. */
function labelGears(res, gbx, redline) {
  if (!res || !res.gears.length) return null;
  const asc = res.gears.slice().sort((a, b) => a.kmhPer1000 - b.kmhPer1000);
  const meas = asc.map(g => g.kmhPer1000);

  if (gbx && gbx.table) {
    const mt = matchGearsToTable(meas, gbx.table);
    if (mt && mt.ok) {
      asc.forEach((g, i) => {
        const t = gbx.table[mt.idx[i]];
        g.gear = t.gear; g.label = 'G' + t.gear;
        g.refKmhPer1000 = t.kmhPer1000; g.refRatio = t.ratio; g.refFinal = t.final;
        g.dev = mt.dev[i];
      });
      const used = new Set(mt.idx);
      const missing = gbx.table.filter((t, i) => !used.has(i));
      return { mode: 'table', gears: gbx.gears, missing, worst: mt.worst,
               label: gbx.label, quelle: gbx.quelle, confidence: gbx.confidence,
               finalUser: gbx.finalUser };
    }
    // Zuordnung passt nicht — das ist selbst ein Befund, kein Grund zum Raten.
    asc.forEach((g, i) => { g.gear = i + 1; g.label = 'S' + (i + 1); });
    return { mode: 'mismatch', gears: gbx.gears, label: gbx.label,
             worst: mt ? mt.worst : null, quelle: gbx.quelle, confidence: gbx.confidence };
  }

  if (gbx && gbx.kind === 'count') {
    // Mehr gemessene Übersetzungen als das Getriebe Gänge hat: das ist ein Widerspruch,
    // kein Rundungsproblem. Entweder stimmt die Angabe nicht, oder die Erkennung hat eine
    // Stufe erfunden. Beides gehört gesagt, statt es durch Nummerieren zu überdecken.
    if (asc.length > gbx.gears) {
      asc.forEach((g, i) => { g.gear = i + 1; g.label = 'S' + (i + 1); });
      return { mode: 'too-many', gears: gbx.gears, measured: asc.length, label: gbx.label };
    }
    const off = gbx.firstGear > 0
      ? Math.min(gbx.firstGear, Math.max(1, gbx.gears - asc.length + 1))
      : suggestFirstGear(meas[0], redline, gbx.gears, asc.length);
    asc.forEach((g, i) => { g.gear = off + i; g.label = 'G' + (off + i); });
    const missing = [];
    for (let n = 1; n <= gbx.gears; n++) if (n < off || n >= off + asc.length) missing.push({ gear: n });
    return { mode: 'count', gears: gbx.gears, firstGear: off, missing,
             suggested: !(gbx.firstGear > 0), label: gbx.label, quelle: gbx.quelle };
  }

  // Ohne jede Angabe: nach Übersetzung nummerieren und das auch so nennen.
  asc.forEach((g, i) => { g.gear = i + 1; g.label = 'S' + (i + 1); });
  return { mode: 'none' };
}
