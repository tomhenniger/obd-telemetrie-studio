# Changelog — 2026-08-28

## Neue Features

- **OBD Telemetrie Studio** als einzelne, self-contained `index.html` erstellt (GitHub-Pages-tauglich).
- **CSV-Parser** mit automatischer Erkennung von Long-/Wide-Format, Trennzeichen (`;` `,` Tab `|`),
  Dezimalzeichen, BOM, CRLF und Zeitformat (Sekunden seit Mitternacht, Unix-Zeit, `hh:mm:ss`, ISO).
  29 MB / 277.000 Zeilen werden in rund 140 ms gelesen.
- **Metrik-Registry**: rund 40 kanonische Messgrößen mit Alias-Regexes und Einheiten-Normalisierung
  (°F→°C, mph→km/h, psi/kPa→bar, mpg→L/100 km, hp/kW→PS). Unbekannte PIDs werden generisch dargestellt.
- **Acht Sektionen**: Überblick, Zeitreihen, Strecke, Verteilungen, Kennfelder, Diagnose,
  Datenqualität und Einstellungen.
- **Diagnose-Regelwerk** mit über 20 Regeln, Sollbereichen aus recherchierten Werksangaben,
  fünf Zuständen (unauffällig / grenzwertig / auffällig / nicht bewertbar / PID fehlt),
  Ursachenbeschreibung und Prüfschritten.
- **Fahrzeugprofile**: Audi S5 B8.5 (CGWC, 3.0 TFSI Kompressor) mit vollständigen Stammdaten und
  bekannten Schwachstellen; dazu generische Profile für Turbo-Benziner, Sauger und Diesel.
  Das Profil wird beim Laden automatisch vorgeschlagen.
- **Eigene Canvas-Diagramm-Engine**: Zeitreihen mit zwei Achsen, Histogramme, Streudiagramme,
  2D-Dichte und Sparklines. LTTB-Downsampling, synchronisiertes Fadenkreuz, Mausrad-Zoom.
- **Karte** als eigene Slippy-Map mit OSM-Kacheln, Route eingefärbt nach frei wählbarer Messgröße,
  Werteanzeige beim Antippen der Route, Maßstab und Höhenprofil.
- **Ganganalyse** über Clustering in log(Drehzahl/Geschwindigkeit); erkennt Übersetzungen aus den
  Daten statt aus einer Tabelle.
- **Beschleunigungsmessungen** (0–100, 50–100, 60–100, 80–120 km/h) werden automatisch aus dem
  Geschwindigkeitsverlauf erkannt, mit Plateau-Filter gegen Fehlmessungen.
- **Export** als Statistik-CSV, JSON-Bericht, GPX-Route und lesbarer Diagnosebericht.

## UI-Änderungen

- Dunkles Standardthema mit hellem Gegenstück, Umschalter und `prefers-color-scheme`-Erkennung.
- Mobile Fassung mit unterer Tab-Leiste, gestapelten Panels, scrollbaren Tabellen und
  Safe-Area-Berücksichtigung; Diagramme reagieren auf Touch, ohne das Seiten-Scrollen zu blockieren.

## Bugfixes

- GPS-Extraktion je Quell-PID statt gemischt: im Long-Format tragen Zeilen verschiedener PIDs
  unterschiedlich alte Fixes, was ein Positions-Ping-Pong erzeugte und die Streckenlänge von
  29 km auf 117 km aufblähte.
- Ladedruck-Einheit wird erkannt und korrigiert (als „bar" ausgezeichnete psi-Werte).
- Ladedruck wird als App-Rechenwert erkannt (R² gegen Motorlast) und bewusst nicht geampelt.
- Flächenfüllung in Zeitreihen bricht an Datenlücken ab, statt Dreiecke zu zeichnen.
- Leerlauf-Erkennung verlangt bekannte Geschwindigkeit und ein zusammenhängendes Fenster ab 5 s.
- Rückkühlung nach Volllast wird nur an Zügen gemessen, die die Ladeluft überhaupt erwärmt haben.

## Bugfixes (Nachtrag)

- **Leerlauf-Regel maß das Einschwingen mit.** Nach dem Anhalten fängt der Leerlaufregler die
  Drehzahl erst ein (Überschwinger bis 955 min⁻¹, Zündwinkel bis −17 ° Momenteneingriff). Diese
  vier bis fünf Sekunden gingen in die Streuung ein und erzeugten einen Fehlalarm: σ 29,2 min⁻¹
  statt der tatsächlichen 8,2 min⁻¹ im eingeschwungenen Zustand. Bewertet werden jetzt nur
  Standphasen ab 12 s, und davon erst die Zeit nach den ersten fünf Sekunden.
- Leerlauf-Befund weist jetzt aus, dass ein warm gestarteter Motor keine Aussage über Verkokung
  zulässt — die zeigt sich im kalten Leerlauf der ersten ein bis zwei Minuten.
- Balkenbeschriftungen wurden am rechten Rand abgeschnitten; der Rand wird jetzt aus der
  breitesten Beschriftung berechnet.

## Neue Features (Nachtrag)

- **Gemischkorrektur über den Lastbereich** als eigene Auswertung im Diagnose-Bereich: Median der
  Langzeitkorrektur je Lastklasse. Steigt der Korrekturbedarf mit der Last, scheiden Falschluft und
  verkokte Einlassventile als Ursache aus; fällt er, ist es die klassische Falschluft-Signatur.
  Der Befundtext benennt die Richtung und ihre Bedeutung.

## Neue Features (Übergabewege)

- **Zwischenablage als Übergabeweg.** Knopf „Aus Zwischenablage" plus ein Einfügefeld auf dem
  Startbildschirm; ⌘V/Strg+V funktioniert überall auf der Seite. Erkennt rohen CSV-Text ebenso wie
  Base64 eines ZIP- oder gzip-Archivs und entpackt im Browser.
- **Übergabe per Adresse**: `?src=<URL>` lädt die Datei selbst (CORS vorausgesetzt),
  `#gz=<base64>` übergibt kleine Dateien direkt in der Adresse, `#clipboard` öffnet die Seite mit
  Übernahme-Knopf. Ein Anker-Wechsel bei bereits geöffneter Seite löst die Übergabe ebenfalls aus.
- **Gepackte Dateien im Datei-Dialog**: `.zip` und `.gz` werden angenommen und im Browser entpackt.
  Eigener minimaler ZIP-Leser über das zentrale Verzeichnis, Entpacken über `DecompressionStream`.
- **Siri-Kurzbefehl**: Anleitung in den Einstellungen und im README. Datei → Archiv → Base64 →
  Zwischenablage → `#clipboard` öffnen. 28 MB werden zu rund 3 Mio. Zeichen, Übernahme unter 2 s.
- **Bericht teilen** über das native Teilen-Menü (`navigator.share`), wo der Browser es unterstützt.

## Bugfixes (Übergabewege)

- Ein Kurzbefehl, der die bereits geöffnete Seite mit einem anderen Anker aufruft, löste keine
  Verarbeitung aus — ein reiner Hash-Wechsel lädt die Seite nicht neu. Jetzt wird auf `hashchange`
  gehört und die Auswertung zurückgesetzt.
- Der Zugriff auf die Zwischenablage kann in manchen Browsern unbegrenzt offen bleiben, solange eine
  Erlaubnisabfrage aussteht. Nach 25 s bricht die Übernahme jetzt mit einem Hinweis auf das
  Einfügefeld ab, statt stumm zu hängen.

## Neue Features (Kaufcheck und Profile)

- **Kaufcheck-Bereich**: 85 Prüfpunkte in neun Phasen vom Telefonat vor dem Termin bis zum Blick
  unter das warme Auto. Je Punkt: was genau zu tun ist, woran man erkennt dass es in Ordnung ist,
  das Warnsignal, Schweregrad, grobe Reparaturkosten und benötigtes Hilfsmittel. Dreiwertiger
  Zustand je Punkt (in Ordnung / Befund / übersprungen), Notizfeld, Fortschritt je Phase.
- **Mitlaufende Kostenbilanz**: jeder als Befund markierte Punkt trägt seine Kostenspanne in eine
  Summe ein. Abbruchkriterien lösen ein eigenes Warnfeld aus statt in der Summe unterzugehen.
- **Mehrere Besichtigungen** parallel führbar, mit Fahrzeugdaten, Preis und Laufleistung.
  Alles im Gerätespeicher, nichts wird übertragen. Export als Textprotokoll und über das Teilen-Menü.
- **OBD-Messprotokoll**: elf Messfahrten in Durchführungsreihenfolge, vom Vorbereitungsabend über
  den Kaltstart bis zum zweiten Fehlerspeicher-Scan. Je Schritt Dauer, genaue Fahranweisung,
  was sie zeigt und Erwartungswerte mit Zahlen.
- **PID-Empfehlungslisten** getrennt für Benziner und Diesel, nach Pflicht/nützlich/optional
  sortiert, jeweils mit Begründung und einem Hinweis zur sinnvollen Obergrenze.
- **Fahrzeugprofile mit Suche**: Volltextsuche über Marke, Familie, Motorkennbuchstaben, Leistung
  und Baujahr, dazu Filter nach Kraftstoff und Aufladung. Eigene Profile anlegen, bearbeiten,
  sichern und einlesen.
- **Klassenbasierte Rückfallwerte**: was ein Profil nicht belegt hat, wird aus der Motorklasse
  ergänzt. Die betroffenen Befunde tragen sichtbar den Hinweis „Sollwert klassenbasiert" statt
  einen Werkswert vorzutäuschen.
- **Erklärfelder an jedem Diagramm**: ein Info-Knopf klappt aus, wie das Diagramm zu lesen ist,
  wie ein unauffälliger Verlauf aussieht und was ein Warnsignal wäre.
- **Anwendung ohne Aufzeichnung nutzbar**: die Kaufcheckliste öffnet sich direkt vom Startbildschirm,
  ohne dass eine CSV geladen sein muss — beim Besichtigungstermin gibt es die noch gar nicht.

## Neue Features (Profilkatalog)

- **220 Fahrzeugprofile** statt vier: VW-Konzern, Mercedes-Benz, BMW, Toyota, Hyundai/Kia, Mazda,
  Honda, Nissan, Suzuki und weitere, Benziner wie Diesel, Baujahre etwa 2003 bis heute.
  200 davon mit vollständig belegten Kernzahlen, jedes mit seinen bekannten Schwachstellen und
  deren Erkennungssignatur. Herstellerweise recherchiert und anschließend von eigenen Prüfagenten
  gegengelesen; unbelegte Angaben wurden gestrichen statt geschätzt.
- **Acht Klassenprofile** als Rückfallebene: Sauger, Turbo klein und groß, Kompressor, Vollhybrid,
  Pumpe-Düse-Diesel, Common-Rail-Diesel mit vier und mit sechs Zylindern.
- **Gewichtete Volltextsuche** über Name, Marke, Motorfamilie, Motorkennbuchstaben, Leistung,
  Hubraum, Trägerfahrzeuge und Baujahr; Teiltreffer statt leerer Liste, wenn nichts alle Begriffe trifft.
- **Ottomotor-Regeln werden bei Dieselprofilen übersprungen** statt als fehlende PID gemeldet,
  mit Erklärung, welche Diesel-Messgrößen an ihre Stelle träten und warum sie im Standard-Export fehlen.
