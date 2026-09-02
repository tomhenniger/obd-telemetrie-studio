---
name: Telemetrie Studio
description: Ein Messgerät auf der Werkstattbank – Ablesungen in dunklen Anzeigefenstern, gravierte Beschriftung, Zustände als LEDs.
colors:
  bg: "#121416"
  bg-2: "#0e1012"
  surface: "#191c1f"
  surface-2: "#1f2327"
  surface-3: "#262b30"
  overlay: "rgba(18,20,22,.9)"
  lcd: "#0b0d0f"
  lcd-line: "#2b3137"
  lcd-text: "#f1efe7"
  lcd-dim: "#a9aba3"
  lcd-dim2: "#8a8e88"
  border: "#2a2f34"
  border-2: "#353b41"
  border-hi: "#4a525a"
  text-1: "#ecebe4"
  text-2: "#a9aba3"
  text-3: "#878b85"
  key: "#ecebe4"
  key-text: "#121416"
  lamp: "#ecebe4"
  lamp-glow: "rgba(236,235,228,.45)"
  accent: "#8fb3d6"
  accent-2: "#a9c6e3"
  accent-soft: "rgba(143,179,214,.12)"
  accent-line: "rgba(143,179,214,.42)"
  ok: "#4fcf92"
  ok-soft: "rgba(79,207,146,.13)"
  ok-line: "rgba(79,207,146,.45)"
  warn: "#e9b44c"
  warn-soft: "rgba(233,180,76,.13)"
  warn-line: "rgba(233,180,76,.45)"
  crit: "#ee6b5b"
  crit-soft: "rgba(238,107,91,.13)"
  crit-line: "rgba(238,107,91,.45)"
  muted-soft: "rgba(169,171,163,.10)"
  chart-grid: "rgba(236,235,228,.06)"
  chart-grid-strong: "rgba(236,235,228,.14)"
typography:
  display:
    fontFamily: "Barlow, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Barlow, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "17px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Barlow, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
  body:
    fontFamily: "Barlow, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "Barlow, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "10.5px"
    fontWeight: 600
    letterSpacing: "0.09em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
    fontSize: "11.5px"
    lineHeight: 1.55
rounded:
  xs: "3px"
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  gap: "12px"
  gap-phone: "10px"
  cell: "11px 13px"
  card: "12px 14px"
  page: "18px 22px"
  page-phone: "12px"
  rail: "236px"
  rail-narrow: "66px"
components:
  button-primary:
    backgroundColor: "{colors.key}"
    textColor: "{colors.key-text}"
    rounded: "{rounded.sm}"
    padding: "8px 13px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-2}"
    textColor: "{colors.key-text}"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.sm}"
    padding: "8px 13px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text-1}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.sm}"
    padding: "8px 13px"
    height: "36px"
  button-icon:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.sm}"
    padding: "8px"
    width: "36px"
    height: "36px"
  button-small:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.sm}"
    padding: "5px 10px"
    height: "30px"
  button-big:
    backgroundColor: "{colors.key}"
    textColor: "{colors.key-text}"
    rounded: "{rounded.sm}"
    padding: "12px 18px"
    height: "46px"
  chip:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.sm}"
    padding: "6px 11px"
    height: "34px"
  chip-selected:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text-1}"
  badge-ok:
    backgroundColor: "{colors.ok-soft}"
    textColor: "{colors.ok}"
    rounded: "{rounded.xs}"
    padding: "2px 7px"
  badge-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
    rounded: "{rounded.xs}"
    padding: "2px 7px"
  badge-crit:
    backgroundColor: "{colors.crit-soft}"
    textColor: "{colors.crit}"
    rounded: "{rounded.xs}"
    padding: "2px 7px"
  badge-info:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.xs}"
    padding: "2px 7px"
  badge-mute:
    backgroundColor: "{colors.muted-soft}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.xs}"
    padding: "2px 7px"
  kpi:
    backgroundColor: "{colors.lcd}"
    textColor: "{colors.lcd-text}"
    typography: "{typography.display}"
    padding: "11px 13px 12px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.md}"
    padding: "12px 14px 14px"
  card-header:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-1}"
    typography: "{typography.title}"
    padding: "12px 14px 10px"
  input:
    backgroundColor: "{colors.lcd}"
    textColor: "{colors.lcd-text}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
    height: "34px"
  seg:
    backgroundColor: "{colors.lcd}"
    textColor: "{colors.lcd-dim}"
    rounded: "{rounded.sm}"
    padding: "2px"
  seg-active:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.xs}"
    padding: "5px 11px"
    height: "28px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.sm}"
    padding: "8px 10px 8px 14px"
  nav-item-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-1}"
  nav-item-active:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-1}"
  note:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.md}"
    padding: "11px 14px"
  note-info:
    backgroundColor: "{colors.accent-soft}"
  note-warn:
    backgroundColor: "{colors.warn-soft}"
  note-crit:
    backgroundColor: "{colors.crit-soft}"
  note-ok:
    backgroundColor: "{colors.ok-soft}"
  finding:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  readout:
    backgroundColor: "{colors.lcd}"
    textColor: "{colors.lcd-text}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    height: "36px"
  drop:
    backgroundColor: "{colors.lcd}"
    textColor: "{colors.lcd-text}"
    rounded: "{rounded.md}"
    padding: "28px 22px 22px"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.lg}"
    width: "min(680px, 100%)"
  topbar:
    backgroundColor: "{colors.overlay}"
    textColor: "{colors.text-1}"
    typography: "{typography.headline}"
    padding: "10px 22px"
    height: "58px"
---

# Design System: Telemetrie Studio

## Overview

**Creative North Star: "Das Messgerät auf der Werkstattbank"**

Telemetrie Studio ist kein Dashboard, sondern ein Prüfgerät. Das Gehäuse ist Graphit, die Beschriftung darauf ist graviert – kleine, gesperrte Versalien in gedecktem Grau –, und jede Ablesung sitzt in einem dunklen Anzeigefenster, das auch im hellen Farbschema dunkel bleibt. Farbe kommt nur dort vor, wo ein Gerät sie hätte: an den Zustands-LEDs (grün, bernstein, rot, jeweils mit schwachem Glimmen) und an der einen beleuchteten Funktionstaste. Alles andere ist Gehäuse, Skala und Linie. Stahlblau existiert, aber nur für Links, den Info-Hinweis und den Fokusring.

Die Dichte ist hoch und ruhig zugleich: Module liegen als Einschübe mit 12 px Abstand im Anzeigefeld, Kennzahlen stehen in einer Anzeigebank, deren Zellen sich mit Haarlinien voneinander trennen, und Diagramme sind Oszilloskopfenster mit Achsenbeschriftung in derselben Schrift wie der Rest des Geräts. Tiefe entsteht ausschließlich durch Linien; nur was wirklich schwebt (der Fahrzeugdialog, das „Mehr“-Fach der Tab-Leiste, die Ablesung über der Karte) darf einen Schatten werfen. Die Welt ist vom Nutzer als bindend gesetzt („Messgerät / Werkstattbank“) und im Build so gelandet, wie der Richtungsvertrag sie beschreibt; die einzige Abweichung ist, dass die Zustands-LED auf dem Typenschild eine einzelne LED „bereit“ ist und keine Reihe.

Verworfen und im Build nicht vorhanden: das schwarz-blaue Dashboard mit Neonakzent, das Kartenraster aus Icon + Titel + Text, Unicode-Glyphen als Icons, Schatten als Ersatz für Ordnung.

**Key Characteristics:**
- Dunkel ist Standard, unabhängig von der Systemeinstellung; hell nur auf ausdrückliche Wahl, im Browser gespeichert.
- Anzeigefenster (`--lcd`) bleiben in beiden Schemata dunkel; Gehäuse und Gravur wechseln.
- Eine Schrift für alles (Barlow 400/500/600, eingebettet), tabellarische Ziffern bis in die Canvas-Diagramme.
- Zustände sind LEDs: Grün/Bernstein/Rot heißen ausschließlich in Ordnung/beobachten/Handlungsbedarf; „gewählt“ leuchtet warmweiß.
- Genau eine beleuchtete Taste pro Ansicht; Stahlblau nur für Links.
- Kanten 3–8 px, Tiefe nur durch Haarlinien; Schatten nur an Schwebendem.
- Eine Icon-Sprite in einer Strichstärke (1,8), keine Glyphen.
- Eine einzige Bewegung: die Seite hebt sich beim Wechsel 4 px an (280 ms).

## Colors

Ein Graphitgehäuse mit warmweißer Gravur; die einzigen gesättigten Farben sind drei LEDs und ein zurückgenommenes Stahlblau.

### Primary
- **Beleuchtete Taste** (`key` #ecebe4 auf `key-text` #121416): die eine primäre Taste je Ansicht („CSV auswählen“, „Daten übernehmen“, „Fahrzeug übernehmen“). Beim Überfahren wird sie zu Hellstahl (`accent-2`), nicht heller weiß. Im Anzeigefenster des Startbildschirms ist sie fest auf #ecebe4/#121416 verdrahtet, damit sie auch im hellen Schema als leuchtende Taste im dunklen Fenster liest.
- **Kanal-Lampe** (`lamp` #ecebe4, Glimmen `lamp-glow`): zeigt „gewählt“ – der 3 px breite LED-Strich neben dem aktiven Kanal in der Seitenleiste, der 16 px lange Strich unter dem aktiven Tab, die 2 px Unterlinie im gedrückten Chip. Warmweiß, nie grün.

### Secondary
- **Stahlblau** (`accent` #8fb3d6, hell `accent-2` #a9c6e3): Links, der Info-Hinweis (`note.info`, `badge.info`), der Fokusring, der Erklärknopf im geöffneten Zustand und der Pfeil vor Maßnahmen. Nie Flächenfarbe, nie Zustandsfarbe. `accent-soft` (12 %) und `accent-line` (42 %) sind Füllung und Rahmen dieser Hinweise sowie der Fokusring an Eingabefeldern.

### Tertiary
- **LED Grün** (`ok` #4fcf92): unauffällig, in Ordnung, erledigt. Auch die Farbe des Fortschrittsbalkens, des Abdeckungsbalkens, des Sollbands im Zeiger und der `accent-color` von Schiebereglern.
- **LED Bernstein** (`warn` #e9b44c): grenzwertig, beobachten, Rechenwert statt Messung.
- **LED Rot** (`crit` #ee6b5b): auffällig, Handlungsbedarf, Fehler beim Einlesen.
- Jede LED hat eine Füllung (`*-soft`, 13 %) und einen Rahmen (`*-line`, 45 %); die Symbolscheibe im Befund glimmt zusätzlich mit `0 0 8px *-line`. `muted-soft` (10 % Grau) ist die Füllung für „nicht bewertbar“ und „PID fehlt“ – ohne Farbe, ohne Glimmen, bei „PID fehlt“ gestrichelt.

### Neutral
- **Gehäuse** (`bg` #121416, dunkler `bg-2` #0e1012): Seitenhintergrund; `bg-2` ist die Seitenleiste, das Typenschild und Kopf- und Fußzeile des Dialogs – die vertiefte Zone des Gehäuses.
- **Einschub** (`surface` #191c1f, `surface-2` #1f2327, `surface-3` #262b30): Modulflächen, Chips und Nebentasten, gedrückter Zustand. Drei Stufen, jede um wenige Prozent heller; keine Stufe ist eine Karte auf einer Karte.
- **Kopfzeilen-Milchglas** (`overlay`): Topbar und Tab-Leiste, mit `backdrop-filter: saturate(140%) blur(10–12px)`.
- **Anzeigefenster** (`lcd` #0b0d0f, Rahmen `lcd-line` #2b3137, Ziffern `lcd-text` #f1efe7, Einheiten `lcd-dim` #a9aba3, Gravur im Fenster `lcd-dim2` #8a8e88): Kennzahlbank, Eingabefelder, Wippschalter, Ablesungen über Diagramm und Karte, Zeigerskala, XML-Vorschau, Fehlercodes, Fortschritts- und Phasenbalken. Diese fünf Werte sind in beiden Schemata dunkel.
- **Gravur** (`text-1` #ecebe4, `text-2` #a9aba3, `text-3` #878b85): Fließtext, Erklärtext, gravierte Beschriftung. Warmweiß ohne Blaustich.
- **Linien** (`border` #2a2f34, `border-2` #353b41, `border-hi` #4a525a): Haarlinie zwischen Modulen und Zellen, Tastenrahmen, Rahmen beim Überfahren oder Drücken. Hell auf dunkel – wie eine Gravur.
- **Skalenraster** (`chart-grid` 6 %, `chart-grid-strong` 14 %): Gitter der Diagramme; Achsentext in `text-3`.

### Helles Schema
Dasselbe Gerät im beleuchteten Labor: pulverbeschichtetes Hellgrau (`bg` #e4e3de, `surface` #f2f1ec), Gravur nahezu schwarz (`text-1` #17191c), die Taste und die Lampe werden nahezu schwarz (`key`/`lamp` #17191c, `key-text` #f2f1ec), Stahlblau und LEDs werden dunkler für Kontrast auf Hell (`accent` #2e5f8f, `ok` #1f8f5f, `warn` #a86a00, `crit` #c43d2f). Die Anzeigefenster bleiben dunkel (`lcd` #15171a, `lcd-line` #2f3438, `lcd-text` #f1efe7). Aktiviert wird es nur über den Umschalter (`data-theme="light"` auf `<html>`), nie über `prefers-color-scheme`; der Standard ist dunkel und wird per JavaScript beim Start explizit gesetzt.

### Serien- und Kanalfarben
- Diagramme lesen ihre Serienpalette aus `--series` (zehn Farben, beginnend mit der warmweißen Gravur: #ecebe4, #e9b44c, #4fcf92, #8fb3d6, #c9a0dc, #66c9c2, #ee8fa5, #b8d36a, #f0a06a, #8a9099; im hellen Schema entsprechend dunkler).
- Jede Messgröße hat eine eigene, wiedererkennbare Farbe (Drehzahl #e2745f, Kühlmittel #e06b62, Ladedruck #6b9cc0, Luftmasse #6fbf7d, Gemischkorrektur #cfa858 …), auf die Leuchtdichte der Welt entsättigt; die Farbton-Identität bleibt, die Neonsättigung nicht.

### Named Rules
**Die LED-Regel.** Grün, Bernstein und Rot bedeuten ausschließlich Zustand (unauffällig, grenzwertig, auffällig). „Gewählt“, „aktiv“ und „gedrückt“ werden mit der warmweißen Lampe gezeigt – nie mit Grün. Wer ein grünes „aktiv“ einbaut, macht aus einer Auswahl ein Prüfergebnis.

**Die Eine-Taste-Regel.** Pro Ansicht leuchtet genau eine Taste (`key`). Alle anderen Tasten sind Gehäuse mit Linie. Stahlblau ist keine Tastenfarbe; es steht für Links, Info und Fokus.

**Die Fenster-Regel.** Zahlen, die abgelesen werden, stehen in einem dunklen Anzeigefenster (`lcd`) mit eigenen Fensterfarben (`lcd-text`, `lcd-dim`, `lcd-dim2`, `lcd-line`) – in beiden Farbschemata. Das Fenster wechselt nicht mit dem Gehäuse.

## Typography

**Display Font:** Barlow (eingebettet, 400/500/600, Latin + Latin-Extended; Fallback system-ui, Segoe UI, Roboto, Helvetica Neue)
**Body Font:** Barlow (dieselbe Schnittfamilie)
**Label/Mono Font:** Barlow für Gravur und Diagrammachsen; ui-monospace/SF Mono/Menlo/Consolas nur für die XML-Vorschau, Code-Schnipsel und das „i“ auf dem Erklärknopf

**Character:** Eine einzige schmale Grotesk trägt das ganze Gerät – Ziffern, Gravur, Erklärtext und Achsenbeschriftung. Sie ist technisch ohne kalt zu sein; tabellarische Ziffern (`font-variant-numeric: tabular-nums` auf `body`, `font-feature-settings: "tnum"` auf Canvas und `.num`) sorgen dafür, dass Ablesungen in Spalten stehen wie auf einer Skala. Barlow unterstützt `tnum`; das ist geprüft.

### Hierarchy
- **Display – Ablesung** (600, 26 px, Zeilenhöhe 1,1, −0,02 em, tabellarisch): der Wert im Anzeigefenster (`.kpi .k-v`). Die Hauptablesung (`.kpi.accent`) ist 29 px – größer, nicht bunter. Am Handy 21 px. Einheit daneben 12,5 px/500 in `lcd-dim`, Unterzeile 11,5 px in `lcd-dim2`.
- **Headline – Seitentitel** (600, 17 px, −0,01 em): die Kopfzeile über dem Anzeigefeld; am Handy 15 px. Der Startbildschirm hat als einzige Ausnahme eine 21 px-Überschrift im Eingabefenster („Aufzeichnung einlesen“, −0,015 em).
- **Title – Modultitel** (600, 13,5 px): Kopfzeile jedes Einschubs (`.card-h h3`), Befundtitel (`.f-t h4`), Prüfpunkt, Kanalname in der Seitenleiste (500). Sektionsüberschriften (`.sech h2`) 15 px, Dialogtitel 16 px.
- **Body – Erklärtext** (400, 14 px Basis, 1,5): in Modulen 12,5–13,5 px mit 1,5–1,6 Zeilenhöhe; Hinweisleisten und Erklärfelder 12,5 px auf max. 84 ch; Beschreibungstext im Fenster 13,5 px auf max. 48 ch. Sekundärer Text in `text-2`, Fußnoten 11,5 px in `text-3`.
- **Label – Gravur** (600, 10,5 px, 0,09 em, Versalien, `text-3`): die eine Konvention für alle Kleinlabels – Kennzahlbeschriftung, Navigationsgruppen, Tabellenköpfe, Dialog- und Formularabschnitte, Typenschildzeilen. Im Anzeigefenster in `lcd-dim2`. Badges (10,5 px/600/0,03 em) und die LED-Beschriftung „bereit“ (0,08 em) sind Verwandte, keine zweite Konvention.
- **Mono – Vorschau** (11,5 px, 1,55): nur `.xmlbox`, `.recipe code` und das kursiv-fette „i“ des Erklärknopfs.
- **Skalen** (Barlow 11 px, Achsen `text-3`; Legenden 11,5 px): Diagrammachsen und Zeigerbeschriftung stehen in der Geräteschrift, nicht in Monospace; `FONT_MONO` ist im Chart-Modul bewusst gleich `FONT_UI`.

### Named Rules
**Die Gravur-Regel.** Jede Kleinbeschriftung ist 10,5 px, 600, 0,09 em gesperrt, in Versalien und in `text-3` – über eine gemeinsame Selektorliste in `02-theme.css` (`.lbl-eng, .navsec, .kpi .k-l, table.tbl th, .plist-h, .pform-s, .mdl-sec, .specs span` …). Eine neue Kleinbeschriftung wird an diese Liste gehängt, nicht neu erfunden.

**Die Tabellenziffern-Regel.** Ziffern sind überall tabellarisch: `body` setzt `tabular-nums`, Ablesungen, Tabellenzellen, Zeigerskalen und Canvas-Elemente setzen `tnum` zusätzlich explizit. Eine Zahl, die beim Umschlagen der Ziffer springt, ist ein Fehler.

**Die Eine-Schrift-Regel.** Barlow trägt alles inklusive der Diagrammachsen. Monospace ist der XML-Vorschau und Code vorbehalten; eine zweite Anzeigeschrift oder eine Systemschrift für Überschriften gibt es nicht.

## Layout

Das Gerät ist ein zweispaltiges Gehäuse: links die Kanalwahl (`rail`, 236 px, `bg-2`, sticky, volle Höhe, rechte Haarlinie), rechts das Anzeigefeld mit einer Kopfzeile aus Milchglas (Topbar, min. 58 px, sticky, `overlay` + Blur, untere Haarlinie) und darunter die Seite (`.page`, Innenabstand 18 px 22 px, max. 1520 px, zentriert). Ohne geladene Datei existiert nur das Anzeigefeld; der Startbildschirm ist eine zentrierte Typenschildplatte von 720 px Breite.

Alles auf der Seite ist ein Raster mit 12 px Abstand (`--gap`): Module (`.card`), Hinweise, die Anzeigebank. Zwei- und Dreispaltigkeit entstehen aus `auto-fit` mit Mindestbreiten (`.g2` ≥ 340 px, `.g3` ≥ 280 px, Kennzahlen ≥ 176 px, Steckbriefzellen ≥ 190 px); Karte und Ablesung teilen sich 2:1. Kein Rasterkind darf breiter werden als die Seite (`.page > * { min-width: 0 }`); breite Tabellen scrollen in ihrem eigenen `.tblwrap`, die erste Spalte und die Kopfzeile bleiben kleben.

Innenmaße folgen einer optischen, nicht arithmetischen Reihe: Modulkopf 12/14/10 px, Modulkörper 12/14/14 px, Modulfuß 9/14 px, Kennzahlzelle 11/13/12 px, Befundzeile 12/14 px, Hinweisleiste 11/14 px, Dialogkopf 15/18/12 px. Reihenabstände in Listen sind 7–10 px mit Haarlinie oben (`border-top`, erste Zeile ohne).

**Zellraster.** Die Anzeigebank (`.kpis`), die Faktenzeile im Befund (`.f-facts`), der Steckbrief (`.specs`), die Schwachstellenliste (`.weak`) und die Typenschildzeilen (`.drop-feat`) sind Raster ohne Lücke: jede Zelle zieht ihre eigene Haarlinie rechts und unten (`border-right`/`border-bottom` mit `margin: 0 -1px -1px 0`), die letzte Reihe schiebt ihre Linie unter den Rahmen, und die letzte Zelle endet ohne Strich ins Leere. So bleibt das Raster bei ungerader Zellenzahl und beim Umbruch am Handy geschlossen.

**Responsiv.**
- ≤ 1080 px: die Seitenleiste wird zur 66 px schmalen Icon-Leiste; Kanalnamen und Gruppen verschwinden, die LED rückt an den Rand.
- ≤ 760 px: die Seitenleiste verschwindet; unten erscheint die Tab-Leiste (fixiert, Milchglas, obere Haarlinie, horizontal scrollbar, Safe-Area beachtet), die Seite bekommt 12 px Rand und 84 px Bodenfreiheit, alle Mehrspalter werden einspaltig, Kennzahlen ≥ 140 px, Ablesungen 21 px. Die Kanäle, die nicht in die Leiste passen, liegen im „Mehr“-Fach: eine Schublade über der Leiste (dreispaltig, `surface`, `border-2`, 8 px Kanten, `shadow-3`).
- ≤ 560 px: der Fahrzeugdialog wird zum Bodenblatt (volle Breite, nur obere Ecken gerundet, Fußtasten gestreckt), die Tasten im Eingabefenster werden vollbreit, Befundkörper verlieren ihren linken Einzug.

Touch-Ziele: Tasten 36 px, kleine Tasten 30 px, Chips und Eingabefelder 34 px, Prüfmarken 34 × 34 px, Profilzeilen 46 px, Tabs mind. 62 px breit.

### Named Rules
**Die Zellraster-Regel.** Zellen in einer Bank trennen sich durch Haarlinien, nicht durch Lücken oder eigene Karten. Die Linie gehört der Zelle (rechts und unten, −1 px Rand), die letzte Zelle einer Reihe zieht keine rechte Linie.

## Elevation & Depth

Dieses System verwendet keine Schatten, um Ordnung herzustellen. Tiefe entsteht durch Haarlinien (`border` auf dunkel, hell auf dunkel wie eine Gravur) und durch drei Gehäusestufen (`bg-2` vertieft, `bg` Grund, `surface`/`surface-2`/`surface-3` Einschübe). Das Anzeigefenster ist die dunkelste Fläche und liegt optisch am tiefsten; alles darin leuchtet. `--shadow-1` ist ausdrücklich `none`: Module, Tasten, Chips, Hinweise und die Anzeigebank werfen im Ruhezustand keinen Schatten.

### Shadow Vocabulary
- **Schwebende Ablesung** (`box-shadow: 0 10px 24px -10px rgba(0,0,0,.7), 0 2px 6px rgba(0,0,0,.4)`, `--shadow-2`): einzig die Ablesung, die über der Karte liegt; am Handy rutscht sie unter die Karte und verliert den Schatten.
- **Schwebender Dialog** (`box-shadow: 0 28px 64px -20px rgba(0,0,0,.85), 0 6px 14px -6px rgba(0,0,0,.5)`, `--shadow-3`): der Fahrzeugdialog nach dem Import und das „Mehr“-Fach der Tab-Leiste – beides liegt tatsächlich über der Seite, hinter beiden dunkelt ein Schleier (`rgba(8,9,10,.62)` mit Blur bzw. `.35`).
- **LED-Glimmen** (`box-shadow: 0 0 8px *-line` an Befund-Symbolen, `0 0 6px *-line` an Akte-Punkten, `0 0 7px ok-line` an der Typenschild-LED, `0 0 8px ok-line` am Fortschrittsbalken): kein Schatten, sondern Licht. Nur an Zustands-LEDs.
- **Lampen-Glimmen** (`box-shadow: 0 0 6px lamp-glow`): am LED-Strich des gewählten Kanals und Tabs.
- **Gedrückter Chip** (`box-shadow: inset 0 -2px 0 lamp`): die Lampe als Unterlinie, kein Schatten.
- **Fokusring** (`outline: 2px solid accent`, 2 px Abstand; Eingabefelder `0 0 0 2px accent-soft` plus `accent-line`-Rahmen).

Im hellen Schema werden die beiden Schatten weicher (`rgba(23,25,28,.25/.08)` und `.35/.15`), das Glimmen bleibt.

### Named Rules
**Die Linien-Regel.** Ordnung kommt aus Linien und Gehäusestufen, nie aus Schatten. Einen Schatten bekommt nur, was tatsächlich über der Seite schwebt: Dialog, Schublade, Kartenablesung.

**Die Glimm-Regel.** Ein Leuchten (6–8 px, in der Linienfarbe der LED) ist eine Zustandsanzeige. Es sitzt an LEDs und an der Kanal-Lampe – nie an Tasten, Modulen oder Text.

## Shapes

Gerätekanten sind eng: Module, Hinweise, Befunde und das Eingabefenster haben 6 px (`md`), die Typenschildplatte, der Dialog und die Schublade 8 px (`lg`), Bedienelemente – Tasten, Chips, Eingabefelder, Wippschalter, Kanalzeilen, Prüfmarken, Zellraster – 4 px (`sm`), Badges, Wippschalterknöpfe, Fehlercodes, Zeigerskala und Phasenbalken 3 px (`xs`). Marken und Balken enden bei 2 px, die Kanal-LED bei 2 px, der Fokusring bei 3 px. Ein `--r-xl` (10 px) ist definiert, wird aber nirgends benutzt und ist kein Teil des Systems.

Runde Formen sind LEDs: die Typenschild-LED (8 px), die Symbolscheibe des Befunds (22 px), die Akte-Punkte (20 px) und der Erklärknopf (22 px, Haarlinienkreis mit kursivem „i“). Alles andere ist rechteckig. Farbtupfer in Chips und Legenden sind 8 px große Quadrate mit 2 px Kanten, Serien-Swatches 11 × 3 px Striche.

Rahmen sind 1 px Haarlinien; das Eingabefenster auf dem Startbildschirm ist die einzige gestrichelte Linie im Ruhezustand (`lcd-line`, beim Überziehen einer Datei wird sie durchgezogen und `text-1`), „PID fehlt“ die einzige gestrichelte LED. Module schneiden ihren Inhalt (`overflow: hidden`), damit die Zellraster-Linien bündig unter dem Rahmen enden.

## Components

### Buttons
Tasten am Gehäuse: flach, mit Haarlinie, tabellarisch beschriftet, ein Symbol aus der Sprite links (15 px).
- **Shape:** eng gerundet (4 px), 36 px hoch, 8 px 13 px Innenabstand, 13 px/500.
- **Primary – beleuchtete Taste:** `key` auf `key-text`, 600; genau eine je Ansicht. Beim Überfahren Hellstahl (`accent-2`), beim Drücken 1 px nach unten (`translateY(1px)`).
- **Secondary – Gehäusetaste:** `surface-2` mit `border-2`, Text `text-1`; beim Überfahren `surface-3` und `border-hi`.
- **Ghost:** ohne Fläche und Rahmen, `text-2`; beim Überfahren `surface-2` mit `border`.
- **Icon:** quadratisch 36 px (Themenschalter in der Kopfzeile). **Small:** 30 px, 5 px 10 px, 12 px. **Big:** 46 px, 12 px 18 px, 14 px/600 (Vorschau kopieren); erledigt wird sie grün (`ok`).
- **Im Anzeigefenster:** Nebentasten sind transparent mit `lcd-line`-Rahmen und `lcd-text`, die Taste ist fest #ecebe4/#121416 – auch im hellen Schema.
- **Deaktiviert:** 50 % Deckung, kein Drücken. Übergänge 160 ms mit `--ease`.

### Chips
Kanalwahl für Messgrößen, als Reihe (`.chiprow`, 7 px Lücke, wahlweise horizontal scrollend).
- **Style:** `surface-2`, Haarlinie `border`, `text-2`, 12,5 px/500, 34 px hoch, 4 px Kanten; vorn ein 8 px-Farbquadrat in der Kanalfarbe.
- **State:** überfahren `border-hi` und `text-1`; gedrückt (`aria-pressed="true"`) `surface-3`, `border-hi`, `text-1` und die Lampe als 2 px Unterlinie (`inset 0 -2px 0 lamp`).

### Badges
Kleine LED-Schilder für Zustand und Bedingung.
- **Style:** 10,5 px/600/0,03 em, 2 px 7 px, 3 px Kanten, 1 px Rahmen; `ok`/`warn`/`crit` mit `*-soft` Füllung und `*-line` Rahmen, `info` in Stahlblau, `mute` in Grau mit `border-2`. Symbol 12 px aus der Sprite (`#i-check`, `#i-tri`, `#i-minus`). In Kopfzeilen dürfen sie schrumpfen (min. 64 px, Ellipse), damit der Titel nicht auf null Breite gedrückt wird.

### Cards / Containers
Jedes Modul ist ein Einschub im Gehäuse.
- **Corner Style:** 6 px.
- **Background:** `surface`, Rahmen `border`.
- **Shadow Strategy:** keiner (siehe Elevation & Depth).
- **Border:** 1 px Haarlinie; Kopfzeile und Fußzeile trennen sich mit derselben Linie.
- **Internal Padding:** Kopf 12/14/10 px (Titel 13,5 px/600, optionaler Hinweis 11,5 px/500/0,04 em, Werkzeuge rechts), Körper 12/14/14 px (`flush` = 0 für Tabellen und Karten), Fuß 9/14 px in 11,5 px `text-3`.
- **Erklärknopf:** 22 px Haarlinienkreis mit kursiv-fettem „i“ in `text-3`; geöffnet stahlblau mit `accent-soft`. Das Erklärfeld („Wie lese ich das?“) klappt im Modul auf (`surface-2`, 4 px, 12,5 px/1,6, `text-2`) statt zu schweben, mit zwei LED-Zeilen für „Unauffällig“ (`ok`) und „Auffällig“ (`crit`).

### Anzeigebank (KPI)
Die Kennzahl als Ablesung im Fenster – das Signaturbauteil.
- **Bank:** `lcd` mit `lcd-line`-Rahmen, 6 px Kanten, Zellen ≥ 176 px (Handy ≥ 140 px) ohne Lücke, Zellraster-Linien in `lcd-line`.
- **Zelle:** 11/13/12 px, Gravur 10,5 px in `lcd-dim2`, Wert 26 px/600 in `lcd-text` mit Einheit 12,5 px in `lcd-dim`, Unterzeile 11,5 px in `lcd-dim2`, optionale Sparkline 24 px hoch. Die Hauptablesung ist 29 px. Die Zelle trägt nie Zustandsfarbe; Zustand steht als Badge daneben.

### Inputs / Fields
Eingaben sind Fenster: man tippt in die Anzeige.
- **Style:** `lcd` mit `lcd-line`, `lcd-text`, 12,5 px, 34 px hoch, 7 px 10 px, 4 px Kanten; Platzhalter `lcd-dim2`. Auswahlfelder ohne Systempfeil, stattdessen ein 5 px-Chevron aus zwei Verläufen in `lcd-dim`.
- **Focus:** Rahmen `accent-line`, Ring `0 0 0 2px accent-soft`, kein Outline.
- **Wippschalter (`.seg`):** ein `lcd`-Fenster mit 2 px Innenabstand; Knöpfe 28 px hoch, 12 px, `lcd-dim`; der gedrückte Knopf ist `surface-3` mit `text-1`/600 und 3 px Kanten.
- **Prüfmarken (`.mk`):** 34 px Quadrate mit `border-2`; gedrückt in der LED-Farbe (`ok`/`crit`) oder grau für „nicht anwendbar“.
- **Schieberegler:** `accent-color: ok`.
- **Einsetzfeld:** transparent im Fenster, `lcd-line`, zentrierter Platzhalter; beim Fokus linksbündig mit Stahlblau-Ring.

### Navigation
Die Kanalwahl am linken Gehäuserand, unten am Handy als Tab-Leiste.
- **Seitenleiste:** `bg-2`, Typenschild oben (30 px `OBD`-Marke als Mini-Fenster, Name 13,5 px/600, Untertitel 11 px `text-3`, untere Haarlinie), Gruppen als Gravur, Kanalzeilen 13,5 px/500 in `text-2` mit 17 px-Symbol (80 % Deckung), 4 px Kanten, 8/10/8/14 px. Überfahren: `surface` und `text-1`. Gewählt (`aria-current="page"`): `surface-2`, `text-1`, Symbol voll, und links ein 3 × 14 px LED-Strich in `lamp` mit Glimmen. Badges rechts (Anzahl auffälliger Befunde). Unten, abgesetzt durch Haarlinie: „Andere CSV“.
- **Schmal (≤ 1080 px):** 66 px, nur Symbole, zentriert, LED am Rand.
- **Tab-Leiste (≤ 760 px):** fixiert, Milchglas, obere Haarlinie; Tabs ≥ 62 px, 21 px-Symbol über 10,5 px/500 in `text-3`; gewählt `text-1` und ein 16 × 2 px Lampenstrich unten. „Mehr“ (`#i-more`) öffnet die Schublade mit den übrigen Kanälen.
- **Kopfzeile:** Seitentitel 17 px/600, Untertitel 12 px `text-3`, rechts die Icon-Taste für das Farbschema.

### Befund (Diagnose)
Eine Zeile auf der Platte: Symbolscheibe, Titel, Wert, Aufklappen.
- **Zeile:** `surface`, `border`, 6 px, Kopf 12/14 px als aufklappbares `<details>`; „PID fehlt“ mit 72 % Deckung.
- **LED:** 22 px Scheibe, `*-soft` Füllung, `*-line` Rahmen, Glimmen 8 px, Symbol 12 px (`check`/`tri`/`minus`); unklar grau ohne Glimmen, fehlend gestrichelt.
- **Text:** Titel 13,5 px/600, Gruppe 11 px/0,03 em `text-3`; rechts der Wert 16 px/600 tabellarisch mit Einheit 11 px darunter; Caret dreht 90° in 200 ms.
- **Körper:** 13 px/1,6 `text-2`, 12 px Abstand: Erklärung, Zeigerskala, Faktenzeile (Zellraster ≥ 140 px auf `surface-2`), Maßnahmen als Liste mit stahlblauem Pfeil, Bedingungs-Badges.
- **Zeigerskala (`.gauge`):** 24 px `lcd`-Band mit `lcd-line`, Sollbereich als `ok-soft`-Band mit `ok-line`-Kanten, 2 px Zeiger in `lcd-text` (in Zustandsfarbe, wenn bewertet), Beschriftung 10,5 px tabellarisch darunter.

### Hinweisleisten
- **Style:** `surface`, `border`, 6 px, 11/14 px, 12,5 px/1,6, Symbol 18 px links (`info`/`alert`), Titel fett in `text-1`, Text max. 84 ch. Stufen `info` (Stahlblau), `warn`, `crit`, `ok` färben Rahmen (`*-line`) und Füllung (`*-soft`).

### Diagramme und Karte
- **Oszilloskopfenster:** Canvas auf `surface`, Gitter `chart-grid`/`chart-grid-strong`, Achsen 11 px Barlow in `text-3`, Fadenkreuz `chart-crosshair`, Sollband `chart-band`; Serien aus `--series` oder der Kanalfarbe der Messgröße; Legende 11,5 px mit 11 × 3 px Strichen; die Ablesung darüber (`.readout`) ist ein `lcd`-Fenster, 36 px, mit Gravur-Beschriftung 0,04 em.
- **Karte:** 460 px (Handy 320 px), 4 px Kanten mit `border`; die Ablesung schwebt oben links als `lcd`-Fenster mit `shadow-2` und wandert am Handy unter die Karte (dann ohne Schatten, mehrspaltig).
- **Farbskala (`.ramp`):** 8 px Balken, 2 px Kanten, Beschriftung 11 px tabellarisch.

### Dialog
- **Fahrzeugdialog:** `surface`, `border-2`, 8 px, `shadow-3`, max. 680 px, Kopf und Fuß in `bg-2` mit Haarlinie, Körper scrollt; Profilliste als `surface-2`-Fenster mit klebender Gravur-Kopfzeile in `surface-3`, Zeilen 46 px, gewählt `surface-3` mit `border-hi`-Innenlinie. Schleier `rgba(8,9,10,.62)` mit Blur. Am Handy Bodenblatt.

### Typenschild (Startbildschirm)
Die Bereitschaftsanzeige: Platte (`surface`, 8 px) mit Typenschildzeile in `bg-2` (OBD-Marke, Name 14 px/600/0,06 em in Versalien, Zweck 11,5 px, rechts LED „bereit“ 8 px grün mit Glimmen), darunter das Eingabefenster (`lcd`, gestrichelte `lcd-line`, 21 px-Überschrift, Text `lcd-dim`, Tastenreihe mit genau einer beleuchteten Taste, Ghost-Taste, Einsetzfeld), vier gravierte Spezifikationszellen (Zellraster auf `surface-2`, 12 px, Titel 12,5 px `text-1`), Fußzeile 11,5 px `text-3` mit Netz-Hinweis.

### Icons
Eine SVG-Sprite (`<defs>` am Anfang von `<body>`), 24 × 24 viewBox, Strich 1,8, runde Enden und Ecken, `currentColor`, ohne Füllung (Ausnahme: Zeiger- und Punkt-Details). Größen: 17 px Seitenleiste, 21 px Tab-Leiste, 15 px in Tasten und Prüfmarken, 18 px in Hinweisen, 12 px in LEDs und Badges. Zustand: `#i-check`, `#i-tri`, `#i-minus`, `#i-x`; Kanäle: `gauge`, `chart`, `map`, `bars`, `grid`, `stetho`, `table`, `car`, `clip`, `ai`, `cog`; Aktionen: `upload`, `dl`, `share`, `phone`, `sun`, `moon`, `more`. Die Textformen ✓ ! ▲ ? – (`STATUS_SYM`) existieren nur für Export und Fenstertitel, nie im DOM.

### Bewegung
Eine einzige gestaltete Bewegung: die Seite hebt sich beim Kanalwechsel 4 px an und blendet ein (`page-in`, 280 ms, `--ease: cubic-bezier(.16,1,.3,1)`). Alles andere sind Zustandsübergänge von 140–200 ms mit derselben Kurve (Tasten, Chips, Kanalzeilen 160 ms; Prüfmarken 140 ms; Caret 200 ms; Eingabefenster beim Überziehen 180 ms). `prefers-reduced-motion` setzt alle Dauern auf 0,001 ms.

## Do's and Don'ts

### Do:
- **Do** Ablesungen in ein `lcd`-Fenster setzen und die Fensterfarben (`lcd-text`, `lcd-dim`, `lcd-dim2`, `lcd-line`) benutzen – sie bleiben in beiden Schemata dunkel.
- **Do** jede Kleinbeschriftung an die Gravur-Selektorliste hängen (10,5 px, 600, 0,09 em, Versalien, `text-3`) statt eigene Werte zu setzen.
- **Do** „gewählt“ mit der warmweißen Lampe zeigen (LED-Strich, Unterlinie, `lamp-glow`), Zustand mit den drei LEDs.
- **Do** pro Ansicht genau eine Taste beleuchten (`key`); alle anderen sind Gehäusetasten mit Haarlinie oder Ghost.
- **Do** Zellen in Bänken über Zellraster-Linien trennen (rechts/unten, −1 px, letzte Zelle ohne rechte Linie) statt über Lücken.
- **Do** Symbole aus der Sprite nehmen (Strich 1,8, 12–21 px) und Zustände über `check`/`tri`/`minus` zeigen.
- **Do** Ziffern tabellarisch setzen, auch auf Canvas (`font-variant-numeric` am Element, `tnum` im Kontext).
- **Do** Kanten aus der Reihe 3/4/6/8 px wählen: Bedienelemente 4, Module 6, Schwebendes 8.
- **Do** Diagrammfarben aus `--series` oder der entsättigten Kanalfarbe der Messgröße lesen, nie hart im Zeichencode setzen.
- **Do** Touch-Ziele mindestens 34 px hoch halten und Rasterkinder mit `min-width: 0` vor seitlichem Überlauf schützen.

### Don't:
- **Don't** Grün für „aktiv“, „gewählt“ oder „gespeichert“ verwenden – Grün heißt „unauffällig“.
- **Don't** Stahlblau als Flächen- oder Tastenfarbe einsetzen; es steht für Links, Info und Fokus.
- **Don't** Schatten an Modulen, Tasten, Chips oder der Anzeigebank – Schatten nur an Dialog, Schublade und schwebender Kartenablesung.
- **Don't** Unicode-Glyphen (✓ ▲ – ⋯) als Icons im DOM; die Textformen gehören ausschließlich in Export und Fenstertitel.
- **Don't** eine zweite Schrift oder eine Systemschrift für Überschriften; Monospace nur für XML-Vorschau und Code.
- **Don't** Karten in Karten: eine Zeile im Dialog ist eine Zeile mit Haarlinie, kein Modul.
- **Don't** die Anzeigefenster im hellen Schema aufhellen oder das Gerät über `prefers-color-scheme` umschalten – dunkel ist Standard, hell nur auf Wahl.
- **Don't** Ablesungen einfärben, um Wichtigkeit zu zeigen; die Hauptablesung ist größer (29 px), nicht bunter.
- **Don't** Kicker, Eyebrows oder Kartenraster aus Icon + Titel + Text; Spezifikationen sind gravierte Zellen.
- **Don't** neue Bewegungen erfinden; die Seite hebt sich, alles andere sind 140–200 ms Zustandswechsel.
