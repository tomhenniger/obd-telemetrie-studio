# Changelog — 2026-09-04

## Neue Features
- **Zwei Fahrten vergleichen** (Fahrzeugakte): zwei gespeicherte Fahrten auswählen, Kennzahlen nebeneinander mit Differenz, Prozent und Bewertung „besser/schlechter“ dort, wo die Richtung eindeutig ist; darunter alle Befunde, deren Status oder Wert sich geändert hat.
- **Mehrere Dateien auf einmal**: abgebrochene Aufzeichnungen lassen sich als CSV-Teile zusammen auswählen oder ablegen; sie werden nach Zeit sortiert zu einer Fahrt zusammengesetzt (gleiche Spalten vorausgesetzt). Eine mitgegebene GPX-Datei ergänzt die Route, wenn die OBD-App kein GPS aufgezeichnet hat.
- **Zusammenfassung teilen** (KI-Prompt): erzeugt einen Link, der Kennzahlen, bewertete Befunde und Fahrzeugprofil gepackt in der Adresse trägt. Kein Server, keine Route, keine Rohdaten. Wer ihn öffnet, sieht die Zusammenfassung als Karte auf dem Startbildschirm.
- **Persönliche Baseline** (Fahrzeugakte): ab fünf Fahrten lernt die Akte je Befund den Normalbereich dieses Wagens (Median, robustes 3σ-Streuband) und den Trend je 30 Tage. Die aktuelle Fahrt wird dagegen bewertet: „außerhalb der eigenen Norm“ trotz grünem Werksband ist der eigentliche Gewinn.
- **Referenzakte**: die exportierte Akte eines anderen Fahrzeugs lässt sich zum Vergleich laden und erscheint als eigene Spalte neben der Baseline; sie wird nicht gespeichert.
- **Wartungsstand** (Fahrzeugakte): Kilometerstand und je Arbeit Stand und Datum eintragen, die Liste rechnet Restlaufzeit und Fälligkeit. Elf Arbeiten, gefiltert nach Bauart: Zahnriemen nur bei Riementrieb, Kompressoröl nur beim Kompressor, Partikelfilter nur beim Diesel.
- **Schaltanalyse** (Kennfelder): Schaltvorgänge aus der Gangzuordnung – Drehzahl vor und nach dem Wechsel je Gangpaar (hoch und runter), Spanne, Geschwindigkeit, Pedalstellung, Schaltdauer, Zeitanteil je Gang als Balken, Zahl der Kickdowns.
- **Wärmehaushalt** (Überblick): Kühlmittel, Öl, Getriebe, Ladeluft, Ansaug- und Außenluft in einem Verlauf, dazu je Größe Startwert, Zeit bis Betriebstemperatur, Niveau der letzten zehn Minuten und Maximum.
- **Bremsen** (Überblick): stärkste Verzögerung, rechnerischer Bremsweg aus 100 km/h, harte Bremsungen (unter −0,3 g) als Liste mit Sprung ins Diagramm, Fading-Hinweis über den Verlauf der Fahrt.
- **Zwei neue Diagnoseregeln**: „Batterie beim Start“ (Ruhespannung vor dem Motorlauf, Einbruch beim Anlassen) und „Ladedruckaufbau bei Volllast“ (Zeit bis 90 % des Spitzendrucks, Kompressor und Turbo getrennt bewertet). Beide erscheinen in der Akte als Trend. Damit 40 Regeln.
- **Verbrauch je Straße** (Strecke, nach dem Tempolimit-Abgleich): Liter und L/100km je Straße und je Klasse Ort, Landstraße, Autobahn, mit Anteil am Gesamtverbrauch.
- **Limit-Bilanz**: Zeitgewinn und Mehrverbrauch aller Abschnitte über dem Limit, gerechnet mit der Verbrauchskurve der eigenen Fahrt (Median je 10-km/h-Klasse bei ruhiger Fahrt), in Litern und Euro.
- **Drucken**: Druckknopf in der Kopfzeile. Druckt die aktuelle Seite hell, ohne Bedienelemente, mit aufgeklappten Befunden; über den Systemdialog auch als PDF (Kaufcheck-Protokoll, Diagnose).
- **Fahrgestellnummer**: steht sie in der Aufzeichnung, zeigt der Fahrzeugdialog Hersteller, Region und Modelljahr; der Kaufcheck übernimmt sie ins FIN-Feld.
- Tempolimits: Option „Start und Ziel weglassen (je 500 m)“ (voreingestellt an), damit die Wohnadresse nicht in der Abfrage steckt.
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
- Build-Prüfung: `npm run check:build` und ein CI-Schritt parsen das gebaute `index.html`, damit ein fehlendes Klammerpaar sofort auffällt statt erst im Rauchtest.

