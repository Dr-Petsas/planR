@echo off
rem Taegliche Preislisten-Aktualisierung (geplante Aufgabe "HKP Preislisten aktualisieren")
cd /d "%~dp0.."
if not exist logs mkdir logs
node --use-system-ca tools\listen-aktualisieren.ts >> logs\listen-aktualisieren.log 2>&1
