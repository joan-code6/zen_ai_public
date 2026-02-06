@echo off
echo Installing Zen CLI...
cd /d "%~dp0"
pip install -e .
echo.
echo Done! You can now run 'zen' from any terminal.
pause
