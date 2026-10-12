@echo off
rem qodbuddy — 仓库根目录的统一接入向导入口 (Windows)。
rem 向导要调用本仓库里的安装脚本, 所以必须从仓库里运行。
setlocal
node "%~dp0assets\wizard.js" %*
exit /b %ERRORLEVEL%
