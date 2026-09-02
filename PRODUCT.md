# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Ein technisch interessierter Privatfahrer, der seinen eigenen Wagen (Audi S5 B8.5, 185.000 km) mit einer OBD-App aufzeichnet und wissen will, ob der Motor gesund ist – und derselbe Nutzer als Käufer beim Gebrauchtwagen, konkret bei der Suche nach einem Audi A4 Avant für seine Partnerin. Zwei Situationen, gleich häufig: am Schreibtisch nach der Fahrt mit großem Bildschirm und Zeit; am Handy direkt am Auto oder beim Besichtigungstermin, mit wenig Zeit, wechselndem Licht und einer Hand.

## Product Purpose

Eine OBD2-CSV-Aufzeichnung so auswerten, dass daraus belastbare Aussagen über den Motorzustand werden: Kennzahlen der Fahrt, Verläufe, Karte, Verteilungen, Kennfelder, und vor allem eine Diagnose, die Messwerte gegen Werksangaben des konkreten Triebwerks stellt. Erfolg heißt: der Nutzer weiß nach der Auswertung, was am Motor unauffällig ist, was beobachtet werden muss, was Handlungsbedarf hat – und was das Werkzeug aus dieser Aufzeichnung gar nicht sagen kann.

## Positioning

Zurückhaltung als Mechanismus: jede Zahl trägt ihren Bezugszeitraum, jede Bewertung ihre Bedingung und die Herkunft ihres Sollwerts (Profil, Klassenwert, Werkstatt-Faustregel), jede Lücke wird benannt statt überbrückt. Konkurrenzprodukte zeigen Kurven; dieses Werkzeug sagt, was die Kurve gegen die Werksangabe bedeutet und wo es das nicht weiß. Alles läuft als eine einzige HTML-Datei auf GitHub Pages, ohne Server, Konto oder laufende Kosten.

## Operating Context

- Aufzeichnung mit Car Scanner ELM OBD2 (Long-Format-CSV, 5–90 MB, teils ohne OBD-Geschwindigkeit, nur GPS). Import per Datei, Zwischenablage, URL oder iPhone-Kurzbefehl.
- Nach dem Import fragt ein Dialog nach dem Fahrzeug (231 Motorprofile, Suche, zuletzt benutzte).
- Zehn Bereiche: Überblick, Zeitreihen, Strecke (Karte), Verteilungen, Kennfelder, Diagnose, Fahrzeugakte, Kaufcheck, KI-Prompt, Datenqualität, Einstellungen. Am Desktop Seitenleiste, am Handy Tab-Leiste unten.
- Diagnose mit 38 Regeln in fünf Zuständen (unauffällig, grenzwertig, auffällig, nicht bewertbar, PID fehlt), dazu Fehlerspeicher-Abgleich und ein Aufzeichnungs-Zettel für die nächste Fahrt.
- Fahrzeugakte: mehrere Fahrten desselben Wagens als Matrix und Verlauf, im Browser gespeichert, als JSON übertragbar.
- Kaufcheck: 85 Prüfpunkte in neun Phasen, elf Messfahrten, auf Motorbauart und Getriebe zugeschnitten, am Handy vor Ort benutzt.
- KI-Prompt: die ganze Auswertung als XML zum Einfügen bei ChatGPT/Claude.
- Getriebekatalog (34 Einträge) für echte Gangnummern statt Nummerierung nach Übersetzung.

## Capabilities and Constraints

- Eine self-contained `index.html` (~1 MB), gebaut aus `src/` per `build.sh`; keine Bibliotheken außer OpenStreetMap-Kacheln. Muss auf GitHub Pages laufen: statisch, keine laufenden Kosten, keine Konten, keine Synchronisation über einen Server.
- Alles Rechnen im Browser; Dateien bis 90 MB in unter einer Sekunde.
- Sprache: durchgehend Deutsch mit Umlauten und ß.
- Dunkles und helles Farbschema, dunkel ist der Standard und bleibt es (vom Nutzer festgelegt).
- Mobiloptimierung ist Pflicht und bleibt: Tab-Leiste, Touch-Ziele, kein seitliches Überlaufen; Rauchtest in `test/smoke.js` prüft Desktop und Handy.
- Der DOM wird aus JavaScript (`src/32-app.js`, `src/28-ui.js`) mit einer festen Klassenvokabel gebaut: `card`, `kpi`, `note`, `btn`, `chip`, `badge`, `tbl`, `tblwrap`, `finding`, `sel`, `inp`, `seg`, `plist`/`prow`, `sugg`, `mdl`, `assist`, `dtc`, `akte`. Ein Redesign arbeitet über Tokens und CSS an dieser Vokabel, nicht gegen sie.
- Diagramme sind eigene Canvas-Zeichnungen (`src/24-chart.js`), Karte eigene Slippy-Map (`src/25-map.js`); Farben kommen aus CSS-Tokens (`--series`, `--fg`, `--dim`, …).
- Tests: 66 Node-Tests, drei echte Aufzeichnungen als lokale Referenz, GitHub Actions.

## Brand Commitments

- Name: „Telemetrie Studio“ (im Kopf), Repository „obd-telemetrie-studio“.
- Voice: sachlich, ehrlich, ohne Panikmache; sagt, was es nicht weiß; erklärt in Info-Panels, wie man ein Diagramm liest und was gut oder schlecht wäre.
- Vom Nutzer als bindend benannt: der Charakter soll „Messgerät / Werkstattbank“ sein – wie ein Prüfstand: technisch, präzise, Skalen und Ablesungen, kühl und sachlich. Dunkel bleibt Standard.

## Evidence on Hand

- Drei echte Aufzeichnungen desselben S5 (privat, nicht im Repo): 29 km Stadt/Land, 10 km Kontrollfahrt mit Ausfall, 108 km gemischt über 91 Minuten. Alle Kennzahlen unabhängig in Python nachgerechnet.
- Screenshots des Ist-Zustands in `test/shots/` (Desktop und Handy je Sektion).
- Keine Kundenstimmen, keine Vergleichszahlen zu anderen Produkten, keine Marktbehauptungen – nichts davon erfinden.

## Product Principles

- Eine Zahl ohne Bezug ist keine Zahl: Zeitraum, Bedingung und Sollwert-Herkunft stehen immer daneben.
- Lücken werden benannt, nie überbrückt; „nicht bewertbar“ ist eine ehrliche Antwort, keine Schwäche.
- Die Datei bleibt beim Nutzer: kein Server, kein Konto, keine Kosten.
- Erklären statt behaupten: jedes Diagramm trägt ein „Wie lese ich das?“.
- Werkstattreif statt Spielerei: Befund, Bedingung, Maßnahme – in dieser Reihenfolge.
