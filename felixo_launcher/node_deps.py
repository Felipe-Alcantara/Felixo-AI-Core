"""Keeps app/node_modules in sync with package.json.

Checks what is actually importable rather than trusting that a previous
`npm install` finished: a half-installed tree is a common cause of a dev
server that starts and then fails on the first import.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from .commands import call_command, resolve_subprocess_command
from .paths import APP_DIR, SOURCE_IMPORT_PATTERN


def ensure_dependencies(
    env: dict[str, str],
    skip_install: bool,
    force_install: bool = False,
) -> int:
    if skip_install:
        return 0

    missing_dependencies = get_missing_node_dependencies(env)
    if not force_install and not missing_dependencies and node_modules_is_current():
        return 0

    if force_install:
        print("[felixo] Source updated. Refreshing dependencies...")
    elif missing_dependencies:
        preview = ", ".join(missing_dependencies[:8])
        remaining = len(missing_dependencies) - 8
        if remaining > 0:
            preview = f"{preview}, ... and {remaining} more"
        print(f"[felixo] Missing npm dependencies detected: {preview}")
        print("[felixo] Installing dependencies...")
    elif not (APP_DIR / "node_modules").exists():
        print("[felixo] node_modules not found. Installing dependencies...")
    else:
        print("[felixo] npm dependency metadata changed. Refreshing dependencies...")

    return call_command(["npm", "install"], cwd=APP_DIR, env=env)


def get_missing_node_dependencies(env: dict[str, str]) -> list[str]:
    package_json = APP_DIR / "package.json"
    node_modules = APP_DIR / "node_modules"

    if not node_modules.exists():
        return ["node_modules"]

    try:
        package_data = json.loads(package_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []

    dependencies: list[str] = []
    for section in ("dependencies", "devDependencies", "optionalDependencies"):
        section_data = package_data.get(section)
        if isinstance(section_data, dict):
            dependencies.extend(
                name for name in section_data if isinstance(name, str)
            )

    missing_dependencies = [
        dependency
        for dependency in sorted(set(dependencies))
        if not node_dependency_exists(node_modules, dependency)
    ]
    missing_dependencies.extend(get_unresolved_node_imports(env))

    return sorted(set(missing_dependencies))


def node_dependency_exists(node_modules: Path, dependency: str) -> bool:
    parts = dependency.split("/")
    if dependency.startswith("@") and len(parts) == 2:
        return node_modules.joinpath(parts[0], parts[1], "package.json").exists()

    return (node_modules / dependency / "package.json").exists()


def get_unresolved_node_imports(env: dict[str, str]) -> list[str]:
    specifiers = collect_external_import_specifiers()
    if not specifiers:
        return []

    script = """
const specifiers = JSON.parse(process.argv[1]);
const unresolved = [];
for (const specifier of specifiers) {
  try {
    import.meta.resolve(specifier);
  } catch {
    unresolved.push(specifier);
  }
}
console.log(JSON.stringify(unresolved));
"""

    node_command = resolve_subprocess_command(
        ["node", "--input-type=module", "-e", script, json.dumps(specifiers)],
        env,
    )

    try:
        result = subprocess.run(
            node_command,
            cwd=APP_DIR,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []

    if result.returncode != 0:
        return []

    try:
        unresolved = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return []

    return [
        specifier
        for specifier in unresolved
        if isinstance(specifier, str)
    ]


def collect_external_import_specifiers() -> list[str]:
    specifiers: set[str] = set()

    for source_file in iter_dependency_checked_source_files():
        try:
            source = source_file.read_text(encoding="utf-8")
        except OSError:
            continue

        for match in SOURCE_IMPORT_PATTERN.finditer(source):
            specifier = match.group(1)
            if is_external_import_specifier(specifier):
                specifiers.add(specifier)

    return sorted(specifiers)


def iter_dependency_checked_source_files() -> list[Path]:
    files = [APP_DIR / "vite.config.ts"]
    source_dir = APP_DIR / "src"
    if source_dir.exists():
        files.extend(
            path
            for path in source_dir.rglob("*")
            if path.suffix in {".js", ".jsx", ".ts", ".tsx"}
        )

    return files


def is_external_import_specifier(specifier: str) -> bool:
    return not (
        specifier.startswith(".")
        or specifier.startswith("/")
        or specifier.startswith("node:")
    )


def node_modules_is_current() -> bool:
    node_modules = APP_DIR / "node_modules"
    if not node_modules.exists():
        return False

    try:
        node_modules_mtime = node_modules.stat().st_mtime
    except OSError:
        return False

    for metadata_file in (APP_DIR / "package.json", APP_DIR / "package-lock.json"):
        try:
            if metadata_file.exists() and metadata_file.stat().st_mtime > node_modules_mtime:
                return False
        except OSError:
            return False

    return True
