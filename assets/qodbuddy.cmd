@echo off
rem Windows 转发脚本：把 qodbuddy（别名：总控（第一页））交给 node 执行。
rem 由 install.ps1 安装到 %USERPROFILE%\.local\bin\。
setlocal
node "%~dp0qodbuddy" %*
exit /b %ERRORLEVEL%
