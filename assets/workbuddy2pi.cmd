@echo off
rem Windows 转发脚本：把 workbuddy2pi 交给 node 执行。
rem 由 workbuddy2pi/install-workbuddy2pi.ps1 安装到 %USERPROFILE%\.local\bin\。
setlocal
node "%~dp0workbuddy2pi" %*
exit /b %ERRORLEVEL%
