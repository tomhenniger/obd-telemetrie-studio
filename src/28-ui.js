/* ============================================================
   UI-Bausteine
   ============================================================ */

function icon(name, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  if (cls) s.setAttribute('class', cls);
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', '#i-' + name);
  s.appendChild(u);
  return s;
}

/* Erklärfeld: „Wie lese ich das?“ — als aufklappbares Feld statt schwebendem Fenster,
   damit es auf dem Handy nicht über den Inhalt fällt. */
function infoPanel(info) {
  if (!info) return null;
  const rows = [];
  if (info.read) rows.push(el('p', {}, info.read));
  if (info.good) rows.push(el('div', { class: 'iv ok' },
    el('span', { class: 'iv-m' }, '✓'), el('div', {}, el('b', {}, 'Unauffällig: '), info.good)));
  if (info.bad) rows.push(el('div', { class: 'iv bad' },
    el('span', { class: 'iv-m' }, '▲'), el('div', {}, el('b', {}, 'Auffällig: '), info.bad)));
  if (info.note) rows.push(el('p', { class: 'dim2' }, info.note));
  return el('div', { class: 'info-panel', hidden: true }, rows);
}

function card(title, opts, ...body) {
  opts = opts || {};
  const panel = infoPanel(opts.info);
  const infoBtn = panel ? el('button', {
    class: 'infobtn', type: 'button', 'aria-expanded': 'false',
    'aria-label': 'Wie lese ich dieses Diagramm?', title: 'Wie lese ich das?',
    onclick: e => {
      const open = panel.hidden;
      panel.hidden = !open;
      e.currentTarget.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  }, 'i') : null;
  const tools = (opts.tools || infoBtn) ? el('div', { class: 'tools' }, opts.tools || null, infoBtn) : null;
  const head = (title || tools) ? el('div', { class: 'card-h' },
    title ? el('h3', {}, title) : null,
    opts.hint ? el('span', { class: 'hint' }, opts.hint) : null,
    tools) : null;
  return el('div', { class: 'card' + (opts.class ? ' ' + opts.class : '') },
    head,
    panel,
    el('div', { class: 'card-b' + (opts.flush ? ' flush' : '') }, body),
    opts.foot ? el('div', { class: 'card-f' }, opts.foot) : null);
}

function kpi(label, value, unit, sub, opts) {
  opts = opts || {};
  const n = el('div', { class: 'kpi' + (opts.accent ? ' accent' : '') },
    el('div', { class: 'k-l' }, label, opts.badge || null),
    el('div', { class: 'k-v' }, value, unit ? el('span', { class: 'k-u' }, unit) : null),
    sub ? el('div', { class: 'k-s' }, sub) : null);
  if (opts.spark && opts.spark.length) {
    const host = el('div', { class: 'k-spark chart-host' });
    n.appendChild(host);
    requestAnimationFrame(() => {
      const ch = new Chart(host, { type: 'spark', height: 26, legend: false, pad: { l: 0, r: 0, t: 3, b: 3 } });
      ch.setData({ sparkData: { y: opts.spark, color: opts.sparkColor } });
    });
  }
  return n;
}

const STATUS_SYM = { ok: '✓', warn: '!', crit: '▲', unklar: '?', missing: '–' };
const STATUS_TXT = { ok: 'unauffällig', warn: 'grenzwertig', crit: 'auffällig',
                     unklar: 'nicht bewertbar', missing: 'PID fehlt' };

/* Soll/Ist-Balken mit grünem Zielband */
function gauge(value, refLo, refHi, status) {
  if (!isFinite(value)) return null;
  let lo = refLo, hi = refHi;
  if (!isFinite(lo) || !isFinite(hi)) return null;
  const pad = Math.max((hi - lo) * 0.8, Math.abs(value - (lo + hi) / 2) * 0.6, 1e-6);
  let vmin = Math.min(lo, value) - pad * 0.35, vmax = Math.max(hi, value) + pad * 0.35;
  if (vmax <= vmin) vmax = vmin + 1;
  const pct = v => clamp((v - vmin) / (vmax - vmin) * 100, 0, 100);
  return el('div', { class: 'gauge' },
    el('div', { class: 'gauge-track' },
      el('div', { class: 'gauge-band', style: { left: pct(lo) + '%', right: (100 - pct(hi)) + '%' } }),
      el('div', { class: 'gauge-mark ' + status, style: { left: 'calc(' + pct(value) + '% - 1.5px)' } })),
    el('div', { class: 'gauge-lbl' },
      el('span', {}, fmtTick(vmin)),
      el('span', { style: { color: 'var(--ok)' } }, 'Soll ' + fmtTick(lo) + ' – ' + fmtTick(hi)),
      el('span', {}, fmtTick(vmax))));
}

function findingCard(r) {
  const st = r.status;
  const val = isFinite(r.value)
    ? el('div', { class: 'f-val' },
        el('b', { class: 'num' }, fmt(r.value, r.dec)),
        el('span', {}, r.unit || ''))
    : null;
  const body = el('div', { class: 'f-b' });
  if (r.text) body.appendChild(el('p', {}, r.text));
  if (r.note) body.appendChild(el('p', {}, r.note));
  if (st === 'missing') body.appendChild(el('p', {},
    'Für diese Prüfung fehlen die Messgrößen: ' + (r.missing || []).join(', ') +
    '. In der OBD-App die entsprechenden PIDs zur Aufzeichnung hinzufügen.'));
  if (!r.noLight && isFinite(r.value) && isFinite(r.refLo) && isFinite(r.refHi)) {
    const g = gauge(r.value, r.refLo, r.refHi, st);
    if (g) body.appendChild(g);
  }
  if (r.extra && r.extra.length)
    body.appendChild(el('div', { class: 'f-facts' },
      r.extra.filter(Boolean).map(([k, v]) => el('div', { class: 'f-fact' },
        el('span', {}, k), el('b', {}, v)))));
  if (r.action && r.action.length)
    body.appendChild(el('ul', { class: 'f-act' }, r.action.map(a => el('li', {}, a))));
  if (r.specDerived)
    body.appendChild(el('p', { class: 'dim2', style: { fontSize: '12px' } },
      'Für dieses Fahrzeugprofil ist der Sollbereich dieser Größe nicht hinterlegt. Bewertet wurde gegen den ' +
      'Rückfallwert der Motorklasse – der ist bewusst weit gefasst, damit er keine Fehlalarme erzeugt, ' +
      'und entsprechend grob. Ein eigenes Profil mit dem Werkswert macht diese Prüfung schärfer.'));
  body.appendChild(el('div', { class: 'f-meta' },
    el('span', { class: 'badge mute' }, 'Aussagekraft: ' + (r.confidence || '–')),
    el('span', { class: 'badge mute' }, r.provenance === 'gemessen' ? 'gemessener Wert'
      : r.provenance === 'abgeleitet' ? 'abgeleiteter Wert' : 'Schätzung'),
    r.ref ? el('span', { class: 'badge mute' }, 'Soll: ' + r.ref) : null,
    r.specDerived ? el('span', { class: 'badge warn' }, 'Sollwert klassenbasiert') : null));

  return el('details', { class: 'finding acc ' + st, open: st === 'crit' || st === 'warn' },
    el('summary', { class: 'f-h' },
      el('div', { class: 'f-sym ' + st }, STATUS_SYM[st]),
      el('div', { class: 'f-t' },
        el('h4', {}, r.title),
        el('div', { class: 'f-grp' }, r.group + ' · ' + STATUS_TXT[st])),
      val,
      el('div', { class: 'f-caret' }, '›')),
    body);
}

/* Diagramm-Karte mit Host + Chart-Instanz */
function chartCard(title, opts, chartOpts) {
  opts = opts || {};
  const host = el('div', { class: 'chart-host' });
  const readout = opts.readout ? el('div', { class: 'readout' }, '—') : null;
  const legend = opts.legend !== false ? el('div', { class: 'legend' }) : null;
  const extra = opts.extra || null;
  const c = card(title, opts, readout, extra, host, legend);
  const chart = new Chart(host, Object.assign({ height: opts.height || 260 }, chartOpts || {}));
  return { node: c, host, chart, legend, readout };
}

function legendItems(legend, series) {
  if (!legend) return;
  legend.innerHTML = '';
  series.forEach(s => legend.appendChild(el('span', { class: 'li' },
    el('i', { class: 'sw', style: { background: s.color } }),
    s.label + (s.unit ? ' (' + s.unit + ')' : ''))));
}

/* Metrik-Auswahl als Chips */
function metricChips(metrics, selected, onChange, opts) {
  opts = opts || {};
  const row = el('div', { class: 'chiprow' + (opts.scroll ? ' scroll' : '') });
  metrics.forEach((m, i) => {
    const on = selected.indexOf(m.id) >= 0;
    const b = el('button', {
      class: 'chip', 'aria-pressed': on ? 'true' : 'false', type: 'button',
      onclick: () => {
        const k = selected.indexOf(m.id);
        if (k >= 0) { if (selected.length > 1 || opts.allowEmpty) selected.splice(k, 1); }
        else { if (opts.max && selected.length >= opts.max) selected.shift(); selected.push(m.id); }
        Array.from(row.children).forEach((c, j) =>
          c.setAttribute('aria-pressed', selected.indexOf(metrics[j].id) >= 0 ? 'true' : 'false'));
        onChange(selected);
      }
    }, el('i', { class: 'dot', style: { background: metricColor(m, i) } }), m.short || m.label);
    row.appendChild(b);
  });
  return row;
}

let PALETTE = null;
function palette() {
  if (!PALETTE) PALETTE = (getComputedStyle(document.documentElement).getPropertyValue('--series') || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  return PALETTE.length ? PALETTE : ['#4da3ff', '#ff8a5c', '#34d399', '#fbbf24', '#c084fc', '#22d3ee'];
}
function metricColor(m, i) {
  if (m && m.color) return m.color;
  const p = palette();
  return p[(i || 0) % p.length];
}

function noteBox(level, title, text) {
  return el('div', { class: 'note ' + (level === 'crit' ? 'crit' : level === 'warn' ? 'warn' : 'info') },
    icon(level === 'crit' ? 'alert' : level === 'warn' ? 'alert' : 'info', 'n-i'),
    el('div', {}, el('b', {}, title), text));
}

function sectionHead(title, sub) {
  return el('div', { class: 'sech' }, el('h2', {}, title), sub ? el('p', {}, sub) : null);
}

function emptyBox(title, text) {
  return el('div', { class: 'empty' }, el('b', {}, title), text);
}

/* Farbverlauf als CSS-Gradient für Legenden */
function rampCss(name) {
  const st = RAMPS[name] || RAMPS.speed;
  return 'linear-gradient(90deg,' + st.map(s => s[1] + ' ' + (s[0] * 100) + '%').join(',') + ')';
}

/* Download-Helfer */
function download(name, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
