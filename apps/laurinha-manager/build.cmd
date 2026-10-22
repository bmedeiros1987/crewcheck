@echo off
setlocal EnableDelayedExpansion
rem ==========================================================================
rem  Laurinha Manager - build com Visual Studio Build Tools 2022
rem
rem  Uso:  build.cmd          compila Release x64 em build\
rem        build.cmd clean    remove build\
rem
rem  Nao precisa de nenhuma dependencia alem do proprio Build Tools: o CRT
rem  entra estatico (/MT), entao o .exe roda sem VC++ Redistributable.
rem ==========================================================================

set "PROJECT_DIR=%~dp0"
set "OUT_DIR=%PROJECT_DIR%build"

if /I "%~1"=="clean" (
    if exist "%OUT_DIR%" rd /s /q "%OUT_DIR%"
    echo [ok] build\ removido.
    exit /b 0
)

rem --- localiza o ambiente do compilador --------------------------------
if defined VCINSTALLDIR goto :have_env

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" set "VSWHERE=%ProgramFiles%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" (
    echo [erro] vswhere.exe nao encontrado.
    echo        Instale o "Visual Studio Build Tools 2022" com a carga de
    echo        trabalho "Desenvolvimento para desktop com C++".
    exit /b 1
)

set "VSPATH="
for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * ^
    -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 ^
    -property installationPath`) do set "VSPATH=%%i"

if not defined VSPATH (
    echo [erro] Nenhuma instalacao com as ferramentas C++ x64 foi encontrada.
    exit /b 1
)
if not exist "%VSPATH%\VC\Auxiliary\Build\vcvarsall.bat" (
    echo [erro] vcvarsall.bat ausente em "%VSPATH%".
    exit /b 1
)

call "%VSPATH%\VC\Auxiliary\Build\vcvarsall.bat" x64 >nul
if errorlevel 1 (
    echo [erro] Falha ao carregar o ambiente x64.
    exit /b 1
)

:have_env
if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"
pushd "%PROJECT_DIR%"

rem --- recursos: icone, manifesto DPI e VERSIONINFO ---------------------
echo [1/2] rc  LaurinhaManager.rc
rc /nologo /I. /fo "%OUT_DIR%\LaurinhaManager.res" LaurinhaManager.rc
if errorlevel 1 goto :fail

rem --- compilacao e link ------------------------------------------------
rem  /MANIFEST:NO  - o manifesto vem do .rc, nao do linker
rem  /SUBSYSTEM:WINDOWS - aplicacao grafica, sem console
rem
rem  LAURINHA_STRICT=1 acrescenta /WX (aviso vira erro). O CI define essa
rem  variavel para travar o gate; no build local ela fica de fora, para que
rem  um aviso novo de uma versao futura do MSVC nao impeca voce de compilar.
set "STRICT="
if defined LAURINHA_STRICT set "STRICT=/WX"

echo [2/2] cl  LaurinhaManager.c %STRICT%
cl /nologo /W4 %STRICT% /O2 /MT /GS /Gy /utf-8 /DUNICODE /D_UNICODE /DNDEBUG ^
   /Fo"%OUT_DIR%\\" /Fd"%OUT_DIR%\LaurinhaManager.pdb" ^
   /Fe"%OUT_DIR%\LaurinhaManager.exe" ^
   LaurinhaManager.c "%OUT_DIR%\LaurinhaManager.res" ^
   /link /SUBSYSTEM:WINDOWS /MANIFEST:NO /OPT:REF /OPT:ICF /DEBUG ^
   comctl32.lib shell32.lib ole32.lib user32.lib gdi32.lib kernel32.lib
if errorlevel 1 goto :fail

popd
echo.
echo [ok] %OUT_DIR%\LaurinhaManager.exe
exit /b 0

:fail
popd
echo.
echo [erro] A compilacao falhou.
exit /b 1
