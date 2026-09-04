# Roadmap

Alles hier läuft weiter als eine statische HTML-Datei auf GitHub Pages: kein Server, kein Konto, keine laufenden Kosten. Aufwand: klein = Stunden, mittel = ein Tag, groß = mehrere Tage.

## Aufgenommen (2026-09-04)

### Erledigt
- [x] Tacho & Reifen: Reifenfaktor aus OBD gegen GPS, Tempomat-Tabelle, Reifenrechner mit passenden Größen, wirksamer Umfang für die Gangerkennung. (2026-09-04)

### Auswertung
- [x] Zwei Fahrten vergleichen (Akte): Kennzahlen nebeneinander mit Differenz und Richtung, veränderte Befunde, Gangübersetzungen. Verläufe übereinanderlegen bleibt offen – dafür müssten Rohdaten in der Akte liegen. (2026-09-04)
- [x] Schaltanalyse (Kennfelder): Schaltpunkte je Gangpaar hoch und runter, Drehzahl davor/danach, Schaltdauer, Zeitanteil je Gang, Kickdowns. (2026-09-04)
- [x] Ladedruckaufbau je Volllastzug als Diagnoseregel (Zeit bis 90 % des Spitzendrucks, Kompressor/Turbo getrennt bewertet), damit auch als Trend in der Akte. (2026-09-04)
- [x] Wärmehaushalt auf dem Überblick: alle Temperaturen in einem Bild, Startwert, Zeit bis Betriebstemperatur, Niveau der letzten 10 Minuten. (2026-09-04)
- [x] Ereignisse auf Karte und Verläufen: Stopps, Volllastzüge, Sprints, Klopfregelung, starke Bremsungen, Betriebswarm als Marker mit Kürzel, ein- und ausblendbar. (2026-09-04)

### Strecke (auf dem OSM-Matching)
- [x] Verbrauch je Straße und Straßenklasse (Ort, Landstraße, Autobahn) nach dem Tempolimit-Abgleich. (2026-09-04)
- [x] Limit-Bilanz: Zeitgewinn und Mehrverbrauch der Überschreitungen aus der eigenen Verbrauchskurve. (2026-09-04)
- [x] Wiederkehrende Abschnitte innerhalb einer Fahrt (60-m-Raster, Durchfahrten mit Dauer und Tempo). Vergleich über mehrere Fahrten bleibt offen – dafür müssten Routen in der Akte liegen. (2026-09-04)

### Werkstatt und Kauf
- [x] Drucken: Druckknopf in der Kopfzeile, helles Schema, aufgeklappte Befunde, ohne Bedienelemente – jede Seite, auch als PDF. (2026-09-04)
- [x] Teilen per Link: Zusammenfassung gepackt in der Adresse (ohne Route, ohne Rohdaten), Empfänger sieht sie auf dem Startbildschirm. QR-Code offen. (2026-09-04)
- [x] Datenschutz-Schnitt: Start und Ziel (je 500 m) werden bei der Tempolimit-Abfrage weggelassen (Voreinstellung an). Exporte enthalten keine Koordinaten. (2026-09-04)

### Plattform
- [ ] Installierbar und offline (PWA, Kachel-Cache). Mittel.
- [ ] Live-Verbindung zum ELM327 per Web Bluetooth (Chrome Android/Desktop). Groß.
- [x] Fahrgestellnummer aus der CSV: Hersteller (WMI), Region, Modelljahr im Fahrzeugdialog, vorausgefüllt im Kaufcheck. (2026-09-04)

## Vorgeschlagen (zweite Runde)

### Motor tiefer
- [x] Leistung aus der Fahrphysik (Kennfelder): Kraft aus Beschleunigung, Luft- und Rollwiderstand und Steigung, je Volllastzug, gegen die Werksangabe. (2026-09-04)
- [x] Massenschätzung aus Leistung und Beschleunigung, mit Streuung und Vergleich zum Leergewicht. (2026-09-04)
- [x] Leerlaufqualität: war als Regel „Leerlaufdrehzahl und -ruhe“ (Drehzahlstreuung) schon vorhanden und ist in der Akte trendfähig. (geprüft 2026-09-04)
- [x] Batterie beim Start als Diagnoseregel: Ruhespannung vor dem ersten Motorlauf und Einbruch beim Anlassen, in der Akte als Trend. (2026-09-04)
- [x] Bremsen auf dem Überblick: stärkste Verzögerung, rechnerischer Bremsweg aus 100, harte Bremsungen mit Liste, Fading-Hinweis. (2026-09-04)

### Deine eigenen Sollwerte
- [x] Persönliche Baseline in der Akte: Median und robustes Streuband je Befund, Trend je 30 Tage, Bewertung der aktuellen Fahrt gegen die eigene Norm. (2026-09-04)
- [x] Referenzakte: fremde Akte laden und als Spalte neben der eigenen Baseline vergleichen, ohne sie zu speichern. (2026-09-04)
- [x] Wartungsstand in der Akte: elf Arbeiten mit Faustintervallen, gefiltert nach Bauart (Zahnriemen, Kompressor, Diesel), Restlaufzeit nach Kilometern und Zeit. (2026-09-04)

### Daten und Import
- [x] Mehrere CSV-Teile zu einer Fahrt zusammenführen (Mehrfachauswahl oder Ablegen, Reihenfolge nach Zeit, gleiche Spalten vorausgesetzt). (2026-09-04)
- [ ] VCDS-Messwertblock-Logs einlesen: die Werkstatt-Logs der Audi-Welt. Mittel.
- [x] GPX-Track ergänzen: GPX zusammen mit der CSV auswählen, Punkte werden als Positionszeilen angehängt. (2026-09-04)

### Erlebnis
- [x] Anmerkungen an Zeitpunkte, als N-Marker in Verlauf und Karte, in Akte und KI-Prompt. (2026-09-04)
- [x] Fahrt nacherleben: Regler und Abspielen auf der Streckenseite, Marker und Zeiger laufen synchron, Tempo 10× bis 300×. (2026-09-04)
- [x] Sollband als Schattierung in den Verläufen (Kühlmittel, Öl, Getriebe, Gemisch, Bordspannung, Kat, Lambda). (2026-09-04)
- [x] Diagramme als Bild speichern (Knopf an jeder Diagrammkarte, PNG mit Titel). (2026-09-04)
- [x] Prompt-Varianten Tiefenanalyse, Werkstatt-Übergabe, Kaufberatung mit Rückfragen-Katalog. (2026-09-04)
