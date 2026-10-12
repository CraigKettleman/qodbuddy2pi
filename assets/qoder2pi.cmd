@echo off
rem Windows 转发脚本：把 qoder2pi 交给 node 执行。
rem 由 qoder2pi/install-pi-qoder.ps1 安装到 %USERPROFILE%\.local\bin\。
setlocal
node "%~dp0qoder2pi" %*
exit /b %ERRORLEVEL%
