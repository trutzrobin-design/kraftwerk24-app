# KRAFTWERK 24 – Public App Package (Version 1.0)

Offline-first Fitness-Web-App für Trainingsplanung, Home-Workouts, Ernährung, Kampfsport, Fortschritt und lokale Backups.

## Enthalten

- Dashboard mit Wochenübersicht, Trainingsquote und aktiven Wochen
- Fünf leere, frei bearbeitbare Trainingstage als neutrale Vorlage
- Satzprotokoll mit Gewicht und Wiederholungen je Satz
- Übungen hinzufügen, bearbeiten und löschen
- Gerätehersteller gym80 / DHZ als auswählbare Optionen; konkrete Modelle müssen anhand eigener Fotos oder Typenschilder geprüft werden
- Home-Workout-Übungsbibliothek und Möglichkeit, eigenes Equipment samt Foto lokal zu hinterlegen
- Ernährungstagebuch, Makro-Summen, manuelle Ziele, Rezeptliste, Essensplan und Einkaufsliste
- Kampfsportprotokoll für Muay Thai und MMA, Technik-Checkliste und Runden-Timer
- Fortschrittsseite, optionale Körpergewichtseinträge, Bestleistungen und Achievements
- Monatskalender
- IndexedDB-Speicherung mit localStorage-Fallback
- JSON-Backup und Wiederherstellung
- vorbereitete, nicht konfigurierte Cloud-Adapter-Schnittstelle (`js/cloud-sync.js`)
- PWA-Manifest und Service Worker für Offline-Cache

## Datenschutz

Dieses öffentliche Paket enthält keine vorausgefüllten persönlichen Profilangaben, persönlichen Trainingsgewichte oder persönlichen Equipment-Fotos. Profil und Trainingstage starten leer. Daten, die später in der App eingetragen werden, werden lokal im Browser des jeweiligen Geräts gespeichert.

**Wichtig:** Lade keine private Importdatei, kein persönliches Backup und keine persönlichen Fotos in dieses öffentliche Repository hoch. GitHub Pages-Websites in öffentlichen Repositories sind öffentlich zugänglich.

## GitHub Pages veröffentlichen

1. Entpacke dieses ZIP.
2. Lade den Inhalt des Ordners `KRAFTWERK24_PUBLIC` in das Stammverzeichnis deines GitHub-Repositories hoch. Lade nicht nur die ZIP-Datei hoch.
3. Öffne im Repository `Settings` → `Pages`.
4. Unter `Build and deployment` wähle `Deploy from a branch`.
5. Wähle Branch `main` und Ordner `/(root)`, dann `Save`.
6. Warte, bis GitHub die Website veröffentlicht hat. Öffne die angezeigte `github.io`-Adresse.
7. Auf dem iPhone in Safari öffnen → `Teilen` → `Zum Home-Bildschirm`.

## Private Daten importieren

Eine private KRAFTWERK-24-Importdatei ist nicht Bestandteil dieses öffentlichen ZIP. Bewahre sie ausschließlich privat auf. In der App kannst du sie über `Einstellungen` → `Backup importieren` laden. Der Import ersetzt den aktuellen lokalen App-Zustand; exportiere vorher ein Backup.

## Speicherung und Grenzen

- Daten werden lokal in IndexedDB im jeweiligen Browser gespeichert.
- Wenn IndexedDB nicht verfügbar ist, versucht die App einen localStorage-Fallback.
- Browserdaten löschen, privates Browsen oder Gerätewechsel können lokale Daten unzugänglich machen. Regelmäßig Backups exportieren.
- Cloud-Synchronisierung ist nicht aktiv. Die Adapter-Schnittstelle ist nur eine Erweiterungsstelle; es gibt keinen konfigurierten Anbieter, kein Backend und keine Konten.
- Es gibt keine automatische Lebensmitteldatenbank oder Barcode-Erkennung.
- Die App ist ein Trainings- und Dokumentationstool, keine medizinische oder professionelle Trainerberatung.

## Lokal testen

- Windows: `start-local.bat` doppelklicken.
- macOS/Linux: `./start-local.sh` ausführen.
- Alternativ im Projektordner `python -m http.server 8080` ausführen und `http://localhost:8080` öffnen.
