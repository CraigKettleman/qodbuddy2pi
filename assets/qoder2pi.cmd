@echo off
rem Windows 转发脚本：把 qoder2pi（别名：总控的 Qoder 页；也带 status/login 等子命令）交给 node 执行。
rem 由 install.ps1 安装到 %USERPROFILE%\.local\bin\。
setlocal
node "%~dp0qoder2pi" %*
exit /b %ERRORLEVEL%
