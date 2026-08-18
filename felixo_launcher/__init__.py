"""Felixo AI Core launcher.

The package behind `start_app.py`, split by responsibility so each concern can
be read and tested on its own:

| Module         | Responsibility                                          |
|----------------|---------------------------------------------------------|
| `paths`        | Repository locations and shared settings                |
| `config`       | The local settings file written by the menu             |
| `node`         | Finding a working Node.js/npm and building its env      |
| `commands`     | Resolving and launching child commands                  |
| `process`      | Stopping the launcher child process tree               |
| `node_deps`    | Keeping `app/node_modules` in sync with `package.json`  |
| `python_deps`  | Installing the launcher's own Python dependencies       |
| `git`          | Fast-forwarding the checkout from the production branch |
| `runner`       | Environment setup and the flag-driven, menu-less path   |
| `menu`         | The interactive menu — the launcher's main interface    |

`main` is re-exported here so the root `start_app.py` stays a thin entrypoint.
"""

from __future__ import annotations

from .cli import main


__all__ = ["main"]
