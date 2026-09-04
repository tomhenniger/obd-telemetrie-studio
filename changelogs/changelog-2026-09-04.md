# Changelog — 2026-09-04

## Neue Features


## UI-Änderungen
- Tempolimits: eine Anfrage je Fahrt statt Abschnitten. Die Route wird formtreu vereinfacht (Douglas–Peucker, Punkte bleiben an Knicken, Toleranz wächst nur bis zum Budget von 650 Punkten) und der Suchkorridor wächst um die Toleranz mit – so schneiden lange Fahrten keine Kurven mehr aus dem Korridor. Ladebalken-Kurve quadratisch statt exponentiell.
- Tempolimits: Fortschrittsanzeige beim Laden (laufender Balken mit Sekundenzähler, KB-Zähler beim Empfang, Zuordnungsphase) statt einer Textzeile.


## Bugfixes
- Tempolimits: Overpass-Drosselung (429) und Überlastung (503/504) werden benannt; zwei Server werden in zwei Runden mit Pause probiert, Fehler erscheinen als Hinweiskasten mit Hinweis auf „Neu von OSM laden“.


## Sonstiges

