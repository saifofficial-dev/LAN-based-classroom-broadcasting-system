@echo off
title KGI Classroom Server
cd /d "%~dp0server"
echo ================================================
echo     KGI Classroom Server - Starting...
echo ================================================
npm start
pause
