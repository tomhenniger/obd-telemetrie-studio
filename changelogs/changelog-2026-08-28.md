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
