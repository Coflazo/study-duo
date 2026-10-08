@echo off
rem Study Duo desktop helper: Chrome starts this through native messaging. It runs study-duo-helper.ps1 next to it.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0study-duo-helper.ps1"
