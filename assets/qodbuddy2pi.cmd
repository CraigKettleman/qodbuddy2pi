@echo off
rem Windows 转发脚本：把 qodbuddy2pi（总控界面）交给 node 执行。
rem 由 install.ps1 安装到 %USERPROFILE%\.local\bin\。
setlocal
node "%~dp0qodbuddy2pi" %*
exit /b %ERRORLEVEL%
