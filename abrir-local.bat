@echo off
start "" http://localhost:8080
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor-local.ps1"
