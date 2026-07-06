#!/usr/bin/env bash
#
# Instalador do comando global "felixo".
#
# >>> PARA QUAL TERMINAL <<<
#   Shell:    Bash ou Zsh
#   Sistemas: Linux, macOS, Git Bash (Windows), WSL (Windows)
#   Use os outros instaladores se o seu terminal for:
#     - PowerShell (qualquer SO) -> powershell/install-felixo-powershell.ps1
#     - CMD (Prompt classico do Windows) -> cmd/install-felixo-cmd.cmd
#
# O que faz: injeta a funcao "felixo" no seu .bashrc (ou .zshrc). Depois de
# instalado, digite "felixo" em qualquer pasta para baixar a versao mais recente
# do repositorio Felixo System Design — tudo, MENOS o submodulo
# components-database. Use "felixo --with-submodules" (ou "felixo -s") para
# incluir tambem o banco de componentes.
#
# Uso:
#   ./install-felixo-bash-zsh.sh              instala (ou atualiza) o comando
#   ./install-felixo-bash-zsh.sh --uninstall  remove o comando
#   ./install-felixo-bash-zsh.sh --help       mostra esta ajuda
#
# Requisitos: bash ou zsh, git e rsync.

set -euo pipefail

REPO_URL="https://github.com/Felipe-Alcantara/Felixo-System-Design.git"
DEST_NAME="Padrão de qualidade - Felixo System Design"
BLOCK_BEGIN="# >>> felixo command (managed by install-felixo.sh) >>>"
BLOCK_END="# <<< felixo command (managed by install-felixo.sh) <<<"

# --- cores do instalador ---
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RESET=$'\033[0m'; C_INFO=$'\033[1;34m'; C_OK=$'\033[1;32m'
  C_WARN=$'\033[1;33m'; C_ERR=$'\033[1;31m'; C_DIM=$'\033[2m'
else
  C_RESET=''; C_INFO=''; C_OK=''; C_WARN=''; C_ERR=''; C_DIM=''
fi
log()  { printf '%s[felixo-install]%s %s\n'   "$C_INFO" "$C_RESET" "$*"; }
ok()   { printf '%s[felixo-install ✓]%s %s\n' "$C_OK"   "$C_RESET" "$*"; }
warn() { printf '%s[felixo-install ⚠]%s %s\n' "$C_WARN" "$C_RESET" "$*" >&2; }
err()  { printf '%s[felixo-install ✗]%s %s\n' "$C_ERR"  "$C_RESET" "$*" >&2; }

print_help() {
  sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'
}

# Descobre o arquivo de configuracao do shell do usuario.
detect_rc_file() {
  local shell_name
  shell_name="$(basename "${SHELL:-}")"
  case "$shell_name" in
    zsh) printf '%s\n' "${ZDOTDIR:-$HOME}/.zshrc" ;;
    bash)
      if [ "$(uname -s)" = "Darwin" ] && [ -f "$HOME/.bash_profile" ]; then
        printf '%s\n' "$HOME/.bash_profile"
      else
        printf '%s\n' "$HOME/.bashrc"
      fi ;;
    *)
      if   [ -f "$HOME/.zshrc"  ]; then printf '%s\n' "$HOME/.zshrc"
      elif [ -f "$HOME/.bashrc" ]; then printf '%s\n' "$HOME/.bashrc"
      else printf '%s\n' "$HOME/.profile"; fi ;;
  esac
}

check_deps() {
  local missing=()
  command -v git   >/dev/null 2>&1 || missing+=(git)
  command -v rsync >/dev/null 2>&1 || missing+=(rsync)
  if [ "${#missing[@]}" -gt 0 ]; then
    err "Dependencias ausentes: ${missing[*]}. Instale-as e rode novamente."
    exit 1
  fi
}

# Gera o bloco com a definicao da funcao felixo (colorida, com barra de loading).
felixo_block() {
  cat <<BLOCK
$BLOCK_BEGIN
felixo() {
  local dest="./$DEST_NAME"
  local repo_url="$REPO_URL"
  local with_submodules=0

  local _r _i _o _w _e _d
  if [ -t 1 ] && [ -z "\${NO_COLOR:-}" ]; then
    _r=\$'\\033[0m'; _i=\$'\\033[1;34m'; _o=\$'\\033[1;32m'
    _w=\$'\\033[1;33m'; _e=\$'\\033[1;31m'; _d=\$'\\033[2m'
  else
    _r=''; _i=''; _o=''; _w=''; _e=''; _d=''
  fi
  _flog()  { printf '%s[felixo]%s %s\\n'   "\$_i" "\$_r" "\$*"; }
  _fok()   { printf '%s[felixo ✓]%s %s\\n' "\$_o" "\$_r" "\$*"; }
  _fwarn() { printf '%s[felixo ⚠]%s %s\\n' "\$_w" "\$_r" "\$*" >&2; }
  _ferr()  { printf '%s[felixo ✗]%s %s\\n' "\$_e" "\$_r" "\$*" >&2; }

  case "\$1" in
    --with-submodules|-s) with_submodules=1 ;;
    -h|--help)
      _flog "Uso: felixo [--with-submodules|-s]"
      _flog "  (sem flag)            baixa core/ e guias/"
      _flog "  --with-submodules,-s  inclui o banco de componentes"
      return 0 ;;
    "" ) ;;
    * ) _fwarn "Opcao ignorada: \$1 (use --with-submodules ou -s)" ;;
  esac

  local _miss=()
  command -v git   >/dev/null 2>&1 || _miss+=(git)
  command -v rsync >/dev/null 2>&1 || _miss+=(rsync)
  if [ "\${#_miss[@]}" -gt 0 ]; then
    _ferr "Dependencias ausentes: \${_miss[*]}. Instale-as e tente novamente."
    return 1
  fi

  local clone_args=(--depth 1 --quiet)
  if [ "\$with_submodules" -eq 1 ]; then
    clone_args+=(--recurse-submodules)
    _flog "Modo completo: incluindo submodulo \${_d}components-database\${_r}."
  fi

  _flog "Sincronizando com \${_d}\${repo_url}\${_r}"
  _flog "Destino: \${_d}\${dest}\${_r}"

  local tmp_dir changes_file source_sha
  tmp_dir="\$(mktemp -d)" || { _ferr "Nao foi possivel criar diretorio temporario."; return 1; }

  git clone "\${clone_args[@]}" "\$repo_url" "\$tmp_dir/repo" &
  local _gpid=\$! _bw=24 _pos=0 _dir=1 _frame _k
  while kill -0 "\$_gpid" 2>/dev/null; do
    _frame=""; _k=0
    while [ "\$_k" -lt "\$_bw" ]; do
      if [ "\$_k" -eq "\$_pos" ]; then _frame="\${_frame}#"; else _frame="\${_frame}-"; fi
      _k=\$((_k+1))
    done
    printf '\\r%s[felixo]%s Clonando [%s]' "\$_i" "\$_r" "\$_frame"
    _pos=\$((_pos+_dir))
    if   [ "\$_pos" -ge "\$((_bw-1))" ]; then _dir=-1
    elif [ "\$_pos" -le 0 ]; then _dir=1; fi
    sleep 0.08
  done
  wait "\$_gpid"; local _crc=\$?
  printf '\\r\\033[K'
  if [ "\$_crc" -ne 0 ]; then
    _ferr "Falha ao clonar (codigo \$_crc). Verifique a conexao e o acesso a \$repo_url."
    rm -rf "\$tmp_dir"; return 1
  fi
  _fok "Repositorio clonado."

  source_sha="\$(git -C "\$tmp_dir/repo" rev-parse --short HEAD 2>/dev/null)"
  [ -n "\$source_sha" ] || { _fwarn "Nao foi possivel ler o SHA do commit."; source_sha="?"; }
  find "\$tmp_dir/repo" -name .git -prune -exec rm -rf {} +
  # Sem o modo completo, remove a pasta do submodulo (fica vazia no clone raso).
  if [ "\$with_submodules" -eq 0 ]; then
    rm -rf "\$tmp_dir/repo/components-database"
  fi
  mkdir -p "\$dest" || { _ferr "Nao foi possivel criar a pasta de destino: \$dest"; rm -rf "\$tmp_dir"; return 1; }

  changes_file="\$(mktemp)" || { _ferr "Nao foi possivel criar arquivo temporario."; rm -rf "\$tmp_dir"; return 1; }
  _flog "Aplicando arquivos..."
  if ! rsync -a --no-times --omit-dir-times --delete --checksum --itemize-changes "\$tmp_dir/repo/" "\$dest/" > "\$changes_file"; then
    _ferr "Falha ao sincronizar os arquivos para \$dest."
    rm -f "\$changes_file"; rm -rf "\$tmp_dir"; return 1
  fi

  if [ -s "\$changes_file" ]; then
    # Classifica as mudancas do rsync em novo / atualizado / removido.
    local _n_novo _n_upd _n_del _total
    _n_novo="\$(grep -c '^>f+++++++++ ' "\$changes_file" 2>/dev/null)"; _n_novo=\${_n_novo:-0}
    _n_del="\$(grep -c '^\\*deleting'   "\$changes_file" 2>/dev/null)"; _n_del=\${_n_del:-0}
    _n_upd="\$(grep -cE '^[>c]f'         "\$changes_file" 2>/dev/null)"; _n_upd=\${_n_upd:-0}
    _n_upd=\$(( _n_upd - _n_novo ))
    [ "\$_n_upd" -lt 0 ] && _n_upd=0
    _total=\$(( _n_novo + _n_upd + _n_del ))

    _fok "Atualizado para \${source_sha}: \${_total} mudanca(s) -> \${_o}+\${_n_novo} novo(s)\${_r}, \${_w}~\${_n_upd} atualizado(s)\${_r}, \${_e}-\${_n_del} removido(s)\${_r}"
    # Lista completa, com rotulos coloridos por tipo.
    awk -v o="\$_o" -v w="\$_w" -v e="\$_e" -v r="\$_r" '
      /^\\*deleting/   { p=\$0; sub(/^\\*deleting[[:space:]]+/,"",p); printf "  %s- removido:  %s %s\\n", e, r, p; next }
      /^>f\\+{9} /     { p=\$0; sub(/^>f\\+{9} /,"",p);              printf "  %s+ novo:      %s %s\\n", o, r, p; next }
      /^[>c]f/         { p=\$0; sub(/^[^ ]+ /,"",p);                printf "  %s~ atualizado:%s %s\\n", w, r, p; next }
    ' "\$changes_file"
  else
    _fok "Ja estava atualizado em \${source_sha}. Nenhuma mudanca."
  fi

  rm -f "\$changes_file"; rm -rf "\$tmp_dir"
  _fok "Concluido em \${dest}"
}
$BLOCK_END
BLOCK
}

remove_block() {
  local rc_file="$1"
  [ -f "$rc_file" ] || return 0
  if grep -qF "$BLOCK_BEGIN" "$rc_file"; then
    local tmp
    tmp="$(mktemp)"
    awk -v b="$BLOCK_BEGIN" -v e="$BLOCK_END" '
      $0 == b {skip=1; next}
      $0 == e {skip=0; next}
      skip != 1 {print}
    ' "$rc_file" > "$tmp"
    cat "$tmp" > "$rc_file"
    rm -f "$tmp"
  fi
}

install() {
  check_deps
  local rc_file
  rc_file="$(detect_rc_file)"
  touch "$rc_file"

  local action="instalado"
  if grep -qF "$BLOCK_BEGIN" "$rc_file"; then
    action="atualizado"
    remove_block "$rc_file"
  fi

  { printf '\n'; felixo_block; } >> "$rc_file"

  ok "Comando \"felixo\" $action em: $rc_file"
  log "Pasta de destino: ${C_DIM}${DEST_NAME}${C_RESET}"
  log "Abra um novo terminal ou rode: ${C_DIM}source \"$rc_file\"${C_RESET}"
  log "Depois, em qualquer pasta:"
  log "  ${C_DIM}felixo${C_RESET}                   -> baixa tudo, menos o submodulo"
  log "  ${C_DIM}felixo --with-submodules${C_RESET} -> inclui o banco de componentes"
}

uninstall() {
  local rc_file
  rc_file="$(detect_rc_file)"
  if [ -f "$rc_file" ] && grep -qF "$BLOCK_BEGIN" "$rc_file"; then
    remove_block "$rc_file"
    ok "Comando \"felixo\" removido de: $rc_file"
    log "Abra um novo terminal para aplicar."
  else
    warn "Nenhuma instalacao do comando \"felixo\" encontrada em: $rc_file"
  fi
}

main() {
  case "${1:-}" in
    --uninstall|-u) uninstall ;;
    --help|-h)      print_help ;;
    ""|--install)   install ;;
    *) err "Opcao desconhecida: $1"; print_help; exit 1 ;;
  esac
}

main "$@"
