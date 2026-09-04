# Changelog — 2026-09-04

## Neue Features
- **Anmerkungen an Zeitpunkten** (Zeitreihen): Zeiger auf die Stelle, Text eingeben, setzen. Erscheint als gestrichelte N-Linie im Verlauf und als Pin auf der Karte, wird mit der Fahrt in der Akte gespeichert und steht im KI-Prompt unter `<anmerkungen>`.
- **Ereignis-Marker** auf Verlauf und Karte: Stopps (S), Volllastzüge (V), gemessene Sprints (M), Klopfregelung (K), starke Bremsungen (B, unter −0,3 g), Betriebswarm (W). Ein- und ausblendbar, mit Legende und Zählern.
- **Sollbänder** in den Verläufen: Kühlmittel, Öl, Getriebe, Gemischkorrektur, Bordspannung, Kat, Lambda bekommen den grünen Sollbereich (Werksangabe aus dem Profil, sonst Klassenwert) hinterlegt.
- **Diagramm als Bild speichern**: Knopf an jeder Diagrammkarte, PNG mit Titel und Dateiname.
- **KI-Prompt in drei Varianten**: Tiefenanalyse, Werkstatt-Übergabe (halbe Seite für den Termin auf der Bühne), Kaufberatung (unbedenklich / verhandelbar / Finger weg), jeweils mit eigenem Rückfragen-Katalog am Ende.
- **Neuer Bereich „Tacho & Reifen“**: Reifenfaktor aus OBD- gegen GPS-Geschwindigkeit (nur ruhige Sekunden, Median, je Geschwindigkeitsklasse, Streubild), Tempomat-Tabelle mit tatsächlicher Geschwindigkeit inklusive einstellbarer Tacho-Voreilung, Reifenrechner (Größe → Durchmesser und Abrollumfang, wirksamer Umfang aus der Messung, Abweichung als Profilverlust oder falsche Größe, passende Größen), Übernahme des wirksamen Umfangs in die Gangerkennung.


## UI-Änderungen
- Tempolimits: eine Anfrage je Fahrt statt Abschnitten. Die Route wird formtreu vereinfacht (Douglas–Peucker, Punkte bleiben an Knicken, Toleranz wächst nur bis zum Budget von 650 Punkten) und der Suchkorridor wächst um die Toleranz mit – so schneiden lange Fahrten keine Kurven mehr aus dem Korridor. Ladebalken-Kurve quadratisch statt exponentiell.
- Tempolimits: Fortschrittsanzeige beim Laden (laufender Balken mit Sekundenzähler, KB-Zähler beim Empfang, Zuordnungsphase) statt einer Textzeile.


## Bugfixes
- Tabellen am Handy: die festgeklemmte erste Spalte lag unter den nachfolgenden Kopfzellen (Ecke zeigte „MESS“ statt „MESSUNG“), hatte keine Kante und rutschte bei breiten Erstspalten am Ende des Scrollwegs mit aus dem Bild. Jetzt: eigene Stapelebene, Kante rechts, erste Spalte bricht am Handy um (max. 46 % der Breite), Tabellen dürfen so schmal werden wie ihr Inhalt.
- Tempolimits: Overpass-Drosselung (429) und Überlastung (503/504) werden benannt; zwei Server werden in zwei Runden mit Pause probiert, Fehler erscheinen als Hinweiskasten mit Hinweis auf „Neu von OSM laden“.


## Sonstiges

