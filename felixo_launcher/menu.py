"""The interactive menu — the launcher's main interface.

Per the project's start-app contract, running the launcher with no arguments
opens this menu: a person installs, configures, starts and inspects the app
from here without memorising any flags. Every action reports what happened and
returns to the menu instead of leaving the person at a bare traceback.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

from .commands import run_command
from .config import CONFIG_FIELDS, load_config, save_config
from .git import get_dirty_files, update_source_from_branch
from .node import (
    build_env,
    find_command_in_bin,
    find_node_bin,
    probe_command,
    read_minimum_node_version,
    read_node_version,
)
from .node_deps import ensure_dependencies
from .paths import APP_DIR, DEFAULT_URL, ROOT_DIR
from .process import cleanup_app_processes
from .python_deps import ensure_python_requirements
from .runner import prepare_node_env


def run_interactive_menu() -> int:
    import questionary
    from rich.console import Console

    console = Console()

    while True:
        console.clear()
        _print_menu_header(console)

        choice = questionary.select(
            "O que você quer fazer?",
            choices=[
                questionary.Choice(
                    "Iniciar / Rodar   — sobe o app desktop ou o preview web",
                    value="start",
                ),
                questionary.Choice(
                    "Instalar / Setup  — instala dependências Python e Node",
                    value="install",
                ),
                questionary.Choice(
                    "Configurar        — CLIs, permissões dos agentes, branch de produção",
                    value="configure",
                ),
                questionary.Choice(
                    "Atualizar         — git pull da branch de produção",
                    value="update",
                ),
                questionary.Choice(
                    "Status            — o que está instalado e pronto agora",
                    value="status",
                ),
                questionary.Choice("Sair", value="exit"),
            ],
        ).ask()

        if choice is None or choice == "exit":
            console.print("[dim]Até mais![/dim]")
            return 0

        if choice == "start":
            _menu_start(console)
        elif choice == "install":
            _menu_install(console)
        elif choice == "configure":
            _menu_configure(console)
        elif choice == "update":
            _menu_update(console)
        elif choice == "status":
            _menu_status(console)

        questionary.press_any_key_to_continue(
            "Pressione uma tecla para voltar ao menu..."
        ).ask()


def _print_menu_header(console: object) -> None:
    from rich.panel import Panel

    console.print(
        Panel.fit(
            "[bold cyan]Felixo AI Core[/bold cyan]\n"
            "[dim]Centraliza ideias, agentes de IA e fluxos de trabalho num canvas único.[/dim]",
            border_style="cyan",
        )
    )


def _menu_start(console: object) -> None:
    import questionary

    target = questionary.select(
        "O que você quer iniciar?",
        choices=[
            questionary.Choice(
                "App desktop (Electron) — a experiência completa", value="desktop"
            ),
            questionary.Choice(
                f"Preview web — abre em {DEFAULT_URL} num navegador", value="web"
            ),
            questionary.Choice("Voltar", value=None),
        ],
    ).ask()

    if not target:
        return

    prepared = prepare_node_env()
    if prepared is None:
        console.print("[red]Não foi possível preparar o Node.js. Veja a mensagem acima.[/red]")
        return
    node_bin, env = prepared
    console.print(f"[dim]Usando Node.js de {node_bin}[/dim]")

    # The Python packages only draw this menu — the app is Node. If they cannot
    # be installed the menu is already on screen anyway, so warn and carry on
    # instead of refusing to start the app over an unrelated dependency.
    if ensure_python_requirements(env, skip_install=False) != 0:
        console.print(
            "[yellow]As dependências Python do menu não puderam ser instaladas — "
            "seguindo assim mesmo, o app não precisa delas.[/yellow]"
        )

    install_code = ensure_dependencies(env, skip_install=False)
    if install_code != 0:
        console.print("[red]Falha instalando dependências Node.[/red]")
        return

    cleanup_app_processes()

    if target == "web":
        console.print(f"[green]Abrindo o preview web em {DEFAULT_URL}...[/green]")
        run_command(["npm", "run", "dev:web"], env)
    else:
        console.print("[green]Abrindo o Felixo AI Core (desktop)...[/green]")
        run_command(["npm", "run", "dev"], env)


def _menu_install(console: object) -> None:
    prepared = prepare_node_env()
    if prepared is None:
        console.print("[red]Não foi possível preparar o Node.js. Veja a mensagem acima.[/red]")
        return
    node_bin, env = prepared
    console.print(f"[dim]Usando Node.js de {node_bin}[/dim]")

    requirements_code = ensure_python_requirements(env, skip_install=False)
    install_code = ensure_dependencies(env, skip_install=False)

    if install_code != 0:
        console.print("[red]Falha instalando as dependências Node — veja as mensagens acima.[/red]")
    elif requirements_code != 0:
        # Node is what the app needs, and it is ready; only the menu's own
        # packages failed, which is not enough to call the setup broken.
        console.print(
            "[green]Dependências do app prontas.[/green] "
            "[yellow]As dependências Python do menu não puderam ser instaladas, "
            "mas o app não precisa delas.[/yellow]"
        )
    else:
        console.print("[green]Dependências prontas.[/green]")


def _menu_configure(console: object) -> None:
    import questionary

    config = load_config()

    field_by_label = {
        f"{field['label']} [{config.get(field['key']) or 'não definido'}]": field
        for field in CONFIG_FIELDS
    }

    label = questionary.select(
        "O que você quer configurar? (Enter em 'Voltar' não muda nada)",
        choices=[*field_by_label.keys(), "Limpar todas as configurações", "Voltar"],
    ).ask()

    if not label or label == "Voltar":
        return

    if label == "Limpar todas as configurações":
        if questionary.confirm("Remover todos os valores configurados?", default=False).ask():
            save_config({})
            console.print("[green]Configurações limpas.[/green]")
        return

    field = field_by_label[label]
    key = str(field["key"])

    if field["kind"] == "choice":
        choices = [*field["choices"], "(limpar)"]  # type: ignore[list-item]
        value = questionary.select(f"{field['label']}:", choices=choices).ask()
    else:
        current = config.get(key, str(field.get("default", "")))
        value = questionary.text(f"{field['label']}:", default=current).ask()

    if value is None:
        return

    if value in ("(limpar)", ""):
        config.pop(key, None)
    else:
        config[key] = value

    save_config(config)
    console.print("[green]Configuração salva.[/green]")


def _menu_update(console: object) -> None:
    config = load_config()
    branch = config.get("FELIXO_PRODUCTION_BRANCH") or os.environ.get(
        "FELIXO_PRODUCTION_BRANCH", "production"
    )

    prepared = prepare_node_env()
    if prepared is None:
        console.print("[red]Não foi possível preparar o Node.js. Veja a mensagem acima.[/red]")
        return
    _node_bin, env = prepared

    update_code, source_updated = update_source_from_branch(branch, env)
    if update_code != 0:
        console.print("[red]Falha ao atualizar — veja as mensagens acima.[/red]")
        return

    if not source_updated:
        console.print("[green]Já estava atualizado.[/green]")
        return

    console.print("[green]Código atualizado.[/green] Atualizando dependências...")
    install_code = ensure_dependencies(env, skip_install=False, force_install=True)
    if install_code != 0:
        console.print("[red]Falha instalando dependências após atualizar.[/red]")
def describe_installed_node(node_bin: Path | None) -> str | None:
    """Reports the version Node actually prints, or None when it cannot be
    queried — `find_command_in_bin` returns None if the binary disappeared
    between discovery and this call, and Status must show real state rather
    than probe a `str(None)` path."""
    if node_bin is None:
        return None

    node_command = find_command_in_bin("node", node_bin)
    if node_command is None:
        return None

    result = probe_command([str(node_command), "--version"], build_env(node_bin))
    if result is None or result.returncode != 0:
        return None

    return result.stdout.strip() or None


def _menu_status(console: object) -> None:
    from rich.table import Table

    table = Table(show_header=False, border_style="dim")
    table.add_column("Item", style="bold")
    table.add_column("Valor")

    node_version = read_node_version()
    minimum_node_version = read_minimum_node_version()
    node_bin = find_node_bin(node_version, minimum_node_version)

    installed_version = describe_installed_node(node_bin)
    if installed_version is not None:
        table.add_row("Node.js", f"[green]{installed_version}[/green] ({node_bin})")
    else:
        minimum_hint = f" (mínimo {minimum_node_version})" if minimum_node_version else ""
        table.add_row("Node.js", f"[red]não encontrado{minimum_hint}[/red]")

    node_modules_exists = (APP_DIR / "node_modules").exists()
    table.add_row(
        "Dependências Node",
        "[green]instaladas[/green]" if node_modules_exists else "[yellow]faltando[/yellow]",
    )

    if (ROOT_DIR / ".git").exists() and shutil.which("git"):
        env = os.environ.copy()
        branch_result = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=ROOT_DIR,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        current_branch = branch_result.stdout.strip() or "(detached)"
        dirty_files = get_dirty_files(env)
        table.add_row("Branch Git", current_branch)
        table.add_row(
            "Alterações locais",
            f"[yellow]{len(dirty_files)} arquivo(s)[/yellow]" if dirty_files else "[green]nenhuma[/green]",
        )
    else:
        table.add_row("Git", "[dim]não é um checkout Git[/dim]")

    config = load_config()
    configured = ", ".join(config.keys()) if config else "(padrão — nada configurado)"
    table.add_row("Configurações salvas", configured)

    console.print(table)
