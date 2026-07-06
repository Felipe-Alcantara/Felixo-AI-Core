@echo off
setlocal EnableDelayedExpansion
rem ============================================================================
rem  felixo-command.cmd - o COMANDO "felixo" para o CMD (Prompt de Comando).
rem
rem  ATENCAO: este NAO e o instalador. Quem registra o comando e
rem  install-felixo-cmd.cmd, que copia este arquivo para o PATH (como
rem  felixo.cmd). Normalmente voce nao roda este arquivo diretamente.
rem
rem  >>> POR QUE O CMD TEM DOIS ARQUIVOS <<<
rem    No Bash/Zsh e PowerShell o instalador escreve a funcao "felixo" dentro do
rem    arquivo de config (.bashrc / $PROFILE), entao basta um arquivo. No CMD um
rem    comando precisa ser um arquivo proprio numa pasta do PATH -- por isso ha
rem    install-felixo-cmd.cmd (instalador) e felixo-command.cmd (o comando, este
rem    arquivo, instalado como felixo.cmd).
rem
rem  Baixa o repositorio Felixo System Design na pasta atual. Por padrao baixa
rem  tudo, MENOS o submodulo components-database. Use "felixo --with-submodules"
rem  (ou "felixo -s") para incluir o banco de componentes.
rem
rem  Para qual terminal: CMD (Windows). Em Bash/Zsh use
rem  bash-zsh/install-felixo-bash-zsh.sh; em PowerShell use
rem  powershell/install-felixo-powershell.ps1.
rem  Requisitos: git no PATH (Windows 10+ para cores ANSI).
rem ============================================================================

rem --- habilita cores ANSI no console (Windows 10+) ---
for /f %%E in ('echo prompt $E ^| cmd') do set "ESC=%%E"
set "C_INFO=%ESC%[1;36m"
set "C_OK=%ESC%[1;32m"
set "C_WARN=%ESC%[1;33m"
set "C_ERR=%ESC%[1;31m"
set "C_RESET=%ESC%[0m"

set "REPO_URL=https://github.com/Felipe-Alcantara/Felixo-System-Design.git"
set "DEST_NAME=Padrão de qualidade - Felixo System Design"
set "WITH_SUB=0"

if /I "%~1"=="--with-submodules" set "WITH_SUB=1"
if /I "%~1"=="-s" set "WITH_SUB=1"
if /I "%~1"=="-h" goto :help
if /I "%~1"=="--help" goto :help

where git >nul 2>nul
if errorlevel 1 (
  echo %C_ERR%[felixo X]%C_RESET% git nao encontrado no PATH. Instale o Git e tente novamente.
  exit /b 1
)

set "CLONE_ARGS=clone --depth 1 --quiet"
if "%WITH_SUB%"=="1" (
  set "CLONE_ARGS=!CLONE_ARGS! --recurse-submodules"
  echo %C_INFO%[felixo]%C_RESET% Modo completo: incluindo submodulo components-database.
)

echo %C_INFO%[felixo]%C_RESET% Sincronizando com %REPO_URL%
echo %C_INFO%[felixo]%C_RESET% Destino: .\%DEST_NAME%

set "TMP_DIR=%TEMP%\felixo-%RANDOM%%RANDOM%"
set "REPO_TMP=%TMP_DIR%\repo"
mkdir "%TMP_DIR%" 2>nul

echo %C_INFO%[felixo]%C_RESET% Clonando... (aguarde)
git !CLONE_ARGS! "%REPO_URL%" "%REPO_TMP%"
if errorlevel 1 (
  echo %C_ERR%[felixo X]%C_RESET% Falha ao clonar. Verifique a conexao e o acesso a %REPO_URL%.
  rmdir /s /q "%TMP_DIR%" 2>nul
  exit /b 1
)
echo %C_OK%[felixo OK]%C_RESET% Repositorio clonado.

rem --- remove diretorios .git ---
for /d /r "%REPO_TMP%" %%G in (.git) do @if exist "%%G" rmdir /s /q "%%G"

rem --- sem o modo completo, remove a pasta do submodulo (vem vazia) ---
if "%WITH_SUB%"=="0" (
  if exist "%REPO_TMP%\components-database" rmdir /s /q "%REPO_TMP%\components-database"
)

if not exist "%DEST_NAME%" mkdir "%DEST_NAME%"

rem --- previa: lista (sem alterar nada) o que vai mudar ---
echo %C_INFO%[felixo]%C_RESET% Mudancas a aplicar:
robocopy "%REPO_TMP%" "%DEST_NAME%" /MIR /L /FP /NS /NC /NDL /NJH /NJS /NP > "%TMP_DIR%\changes.txt" 2>nul
rem  Robocopy marca arquivos a remover com "*EXTRA"; os demais sao novos/alterados.
findstr /C:"*EXTRA" "%TMP_DIR%\changes.txt" >nul 2>nul && (
  echo %C_ERR%[felixo]   --- removidos ^(*EXTRA^) ---%C_RESET%
  for /f "tokens=1,*" %%A in ('findstr /C:"*EXTRA" "%TMP_DIR%\changes.txt"') do echo %C_ERR%   - %%B%C_RESET%
)
echo %C_OK%[felixo]   --- novos / atualizados ---%C_RESET%
for /f "usebackq delims=" %%L in ("%TMP_DIR%\changes.txt") do (
  echo %%L | findstr /C:"*EXTRA" >nul 2>nul || (
    set "LINE=%%L"
    rem ignora linhas vazias
    if defined LINE echo %C_OK%   + !LINE!%C_RESET%
    set "LINE="
  )
)

echo %C_INFO%[felixo]%C_RESET% Aplicando arquivos...
robocopy "%REPO_TMP%" "%DEST_NAME%" /MIR /NFL /NDL /NJH /NJS /NP >nul
if %ERRORLEVEL% GEQ 8 (
  echo %C_ERR%[felixo X]%C_RESET% Falha ao copiar os arquivos (robocopy).
  rmdir /s /q "%TMP_DIR%" 2>nul
  exit /b 1
)

rmdir /s /q "%TMP_DIR%" 2>nul
echo %C_OK%[felixo OK]%C_RESET% Concluido em .\%DEST_NAME%
exit /b 0

:help
echo Uso: felixo [--with-submodules ^| -s]
echo   (sem flag)            baixa tudo, menos o submodulo components-database
echo   --with-submodules,-s  inclui o banco de componentes
exit /b 0
