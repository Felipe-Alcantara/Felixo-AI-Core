; Ganchos do Felixo AI Core no instalador NSIS do electron-builder
; (`build.nsis.include`). Incluído no cabeçalho do instalador E do
; desinstalador, antes dos templates: macros daqui só expandem na inserção.
;
; Por que existe: a instalação silenciosa (`/S`) por cima de uma instalação cuja
; pasta está gravada com nome curto 8.3 (`C:\Users\RUNNER~1\...`), com o app
; aberto, travava para sempre. Medido em runner Windows (task
; 3e291f95497e81058292f38d63a3034c, run 37591182111, cenário I):
;
; 1. A checagem padrão procura o app com `Win32_Process.Path.StartsWith($INSTDIR)`.
;    O Windows devolve o caminho LONGO do processo, que nunca começa com o curto:
;    o app não é visto e não é fechado.
; 2. O desinstalador antigo (já distribuído, não dá para corrigir) falha com os
;    arquivos em uso, e o instalador mostra um MessageBox sem `/SD`: em `/S`
;    ninguém o vê, e o processo (elevado) espera o clique para sempre.

!include "getProcessInfo.nsh"
; A checagem padrão usa `$pid`; o electron-builder só o declara quando o
; projeto NÃO define `customCheckAppRunning`.
Var pid

; Troca `VAR` pela forma longa do caminho quando a pasta existe. Uma pasta que
; ainda não existe (destino de `/D=`) não tem app rodando e fica como veio.
!macro felixoCaminhoLongo VAR
  Push $0
  Push $1
  System::Call 'kernel32::GetLongPathNameW(w "${VAR}", w .r1, i ${NSIS_MAX_STRLEN}) i .r0'
  ${if} $0 > 0
  ${andIf} $0 < ${NSIS_MAX_STRLEN}
    StrCpy ${VAR} $1
  ${endIf}
  Pop $1
  Pop $0
!macroend

; Substitui a checagem padrão de app aberto: a MESMA lógica do electron-builder
; (`_CHECK_APP_RUNNING`, fechar com aviso em `/SD`), rodada com o caminho longo e,
; no instalador, também nas pastas da instalação anterior. Com `/D=` para outra
; pasta, a padrão só olha o destino, e quem esbarra no app aberto é o
; desinstalador antigo. A checagem padrão entra UMA vez (num laço pelas pastas):
; inseri-la de novo na mesma seção duplicaria os rótulos dela.
!macro customCheckAppRunning
  Var /GLOBAL felixoInstDir
  Var /GLOBAL felixoDestinoLongo
  Var /GLOBAL felixoPasso
  StrCpy $felixoInstDir $INSTDIR
  StrCpy $felixoDestinoLongo $INSTDIR
  !insertmacro felixoCaminhoLongo $felixoDestinoLongo
  StrCpy $felixoPasso 0
  !insertmacro IS_POWERSHELL_AVAILABLE
  ; Um `Quit` dentro da checagem (app que não fecha) sai com erro, não com 0.
  SetErrorLevel 1

  !ifndef BUILD_UNINSTALLER
  felixo_proxima_pasta:
  !endif
    ${if} $felixoPasso == 0
      StrCpy $INSTDIR $felixoInstDir
    !ifndef BUILD_UNINSTALLER
    ${elseif} $felixoPasso == 1
      ReadRegStr $INSTDIR HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${else}
      ReadRegStr $INSTDIR HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
    !endif
    ${endIf}

    ${if} $INSTDIR != ""
    ${andIf} ${FileExists} "$INSTDIR\*.*"
      !insertmacro felixoCaminhoLongo $INSTDIR
      ; Pasta anterior igual ao destino já foi checada no passo 0.
      ${if} $felixoPasso == 0
      ${orIf} $INSTDIR != $felixoDestinoLongo
        !insertmacro _CHECK_APP_RUNNING
      ${endIf}
    ${endIf}

  !ifndef BUILD_UNINSTALLER
    IntOp $felixoPasso $felixoPasso + 1
    IntCmp $felixoPasso 3 0 felixo_proxima_pasta
  !endif

  StrCpy $INSTDIR $felixoInstDir
  SetErrorLevel 0
!macroend

; Resultado do desinstalador antigo: igual ao padrão, mas o MessageBox ganha
; `/SD IDOK`. Em `/S` a falha vira código de saída 2 em tempo limitado, em vez
; de uma caixa invisível que segura o instalador (elevado) para sempre.
!macro felixoResultadoDaDesinstalacao
  IfErrors 0 +3
  DetailPrint `Uninstall was not successful. Not able to launch uninstaller!`
  Return

  ${if} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0" /SD IDOK
    DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
    SetErrorLevel 2
    Quit
  ${endif}
!macroend

!macro customUnInstallCheck
  !insertmacro felixoResultadoDaDesinstalacao
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro felixoResultadoDaDesinstalacao
!macroend
