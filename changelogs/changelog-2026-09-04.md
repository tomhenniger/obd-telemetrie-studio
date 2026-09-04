# Changelog — 2026-09-04

## Neue Features


## UI-Änderungen
- Tempolimits: die Route wird in Abschnitte von etwa 15 km (höchstens sechs) geteilt und nacheinander abgefragt; der Balken zeigt den echten Fortschritt, die Karte färbt sich abschnittsweise ein, Straßen an den Schnittstellen werden per ID zusammengeführt. Ladebalken-Kurve quadratisch statt exponentiell.
- Tempolimits: Fortschrittsanzeige beim Laden (laufender Balken mit Sekundenzähler, KB-Zähler beim Empfang, Zuordnungsphase) statt einer Textzeile.


## Bugfixes
- Tempolimits: Overpass-Drosselung (429) und Überlastung (503/504) werden benannt; zwei Server werden in zwei Runden mit Pause probiert, Fehler erscheinen als Hinweiskasten mit Hinweis auf „Neu von OSM laden“.


## Sonstiges

