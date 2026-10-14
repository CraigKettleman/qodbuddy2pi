@echo off
rem dev.cmd — 开发模式入口 (Windows)：直接用仓库里的代码跑总控，不安装。
rem 普通用户不需要它；装完之后日常用的是 qodbuddy2pi。
setlocal
node "%~dp0assets\qodbuddy2pi" %*
exit /b %ERRORLEVEL%
