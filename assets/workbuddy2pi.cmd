@echo off
rem Windows 转发脚本：把 workbuddy2pi（别名：总控的 WorkBuddy 国内版页；也带服务与账号子命令）交给 node 执行。
rem 由 install.ps1 安装到 %USERPROFILE%\.local\bin\。
setlocal
node "%~dp0workbuddy2pi" %*
exit /b %ERRORLEVEL%
