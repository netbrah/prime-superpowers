@echo off
where wsl >NUL 2>NUL
if errorlevel 1 (
  echo E_WSL_REQUIRED: Windows launches require WSL. 1>&2
  exit /b 1
)
wsl.exe sh -lc "./prime ""$@""" -- %*
exit /b %ERRORLEVEL%
