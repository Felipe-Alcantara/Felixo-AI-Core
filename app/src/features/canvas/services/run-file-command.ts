/**
 * Interpreter binary + arg builder for "run this file in a terminal", keyed
 * by extension. Kept to a handful of common, unambiguous cases — anything
 * else falls back to letting the OS shell resolve it directly (file
 * associations, shebang, `.exe`/`.bat`/`.cmd`/`.ps1`, etc.).
 */
/** What a caller needs to spawn the terminal that runs a picked file. */
export type RunFileOptions = {
  command: string
  args: string[]
  cwd: string
  label: string
  /** Interpreter to try when `command` isn't installed (Windows `py`/`python`). */
  fallbackCommand?: string
}

const INTERPRETER_BY_EXTENSION: Record<string, string> = {
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
export function buildRunCommand(fileName: string): {
  command: string
  args: string[]
  fallbackCommand?: string
} {
  const dotIndex = fileName.lastIndexOf('.')
  const extension = dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : ''

  if (extension === '.py') {
    // Most Linux distros (and macOS setups) only ship `python3`, not a bare
    // `python`. The PTY's POSIX launch path already runs explicit commands
    // through the user's login shell, so `python3` can be resolved there
    // directly. Keeping the interpreter as the command (instead of wrapping
    // it in `env`) also preserves the same launch contract as node/bash and
    // avoids an extra process on macOS.
    //
    // Windows has no single reliable interpreter name: the `py` launcher ships
    // with python.org installs but is absent from Microsoft Store and conda
    // setups, which provide `python` instead. Since the Windows PTY already
    // goes through cmd.exe, we let cmd try `py` and fall back to `python` when
    // it isn't there, rather than betting on either one being present.
    return window.felixo?.platform === 'win32'
      ? { command: 'py', args: [fileName], fallbackCommand: 'python' }
      : { command: 'python3', args: [fileName] }
  }

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
