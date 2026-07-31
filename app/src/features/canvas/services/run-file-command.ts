/**
 * Interpreter binary + arg builder for "run this file in a terminal", keyed
 * by extension. Kept to a handful of common, unambiguous cases — anything
 * else falls back to letting the OS shell resolve it directly (file
 * associations, shebang, `.exe`/`.bat`/`.cmd`/`.ps1`, etc.).
 */
const INTERPRETER_BY_EXTENSION: Record<string, string> = {
  '.py': 'python',
  '.js': 'node',
  '.mjs': 'node',
  '.cjs': 'node',
  '.ts': 'npx',
  '.sh': 'bash',
  '.ps1': 'powershell',
}

/**
 * Builds the {command, args} to spawn a terminal that runs `fileName`
 * directly (no shell typed afterwards — the file IS the process), given the
 * file's name relative to the terminal's cwd.
 */
export function buildRunCommand(fileName: string): { command: string; args: string[] } {
  const dotIndex = fileName.lastIndexOf('.')
  const extension = dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : ''
  const interpreter = INTERPRETER_BY_EXTENSION[extension]

  if (interpreter === 'npx') {
    // .ts has no universally-installed global interpreter; tsx via npx is
    // the closest thing to a safe default (auto-installs on first run).
    return { command: 'npx', args: ['tsx', fileName] }
  }
  if (interpreter) {
    return { command: interpreter, args: [fileName] }
  }
  // Unknown extension: hand the bare path to the shell and let it decide
  // (shebang, file association, or a clear "not executable" error) — same
  // as a user typing `./file` themselves.
  return { command: fileName, args: [] }
}
