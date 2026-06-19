@echo off
echo Compiling Dolphin Clicker C# Backend...
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:exe /out:clicker.exe src\clicker.cs
if %errorlevel% neq 0 (
    echo Compilation FAILED!
    pause
    exit /b %errorlevel%
)
echo Compilation successful: clicker.exe has been created.
