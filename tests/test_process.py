"""Tests for stopping the app and clearing leftover processes.

`pgrep -f` matches whole command lines, so cleanup has to tell a stale dev
server apart from an editor that merely has the app path open. Shutdown also
runs from a signal handler, which constrains how the child can be reaped.
"""

from __future__ import annotations

import signal
import subprocess
import unittest
from unittest.mock import MagicMock, patch

from felixo_launcher import paths
from felixo_launcher import process as process_module


class ProcessCleanupTests(unittest.TestCase):
    """`pgrep -f` matches whole command lines, so cleanup has to distinguish a
    stale Vite/Electron from an editor that merely has the path open."""

    def test_kills_only_processes_started_by_this_launcher(self) -> None:
        marker = str(paths.APP_DIR / "node_modules")
        pgrep_output = "\n".join(
            [
                f"4001 node {marker}/vite/bin/vite.js --host 127.0.0.1",
                f"4002 /usr/bin/vim {marker}/notes.txt",
                f"4003 grep -r foo {marker}",
                f"4004 node {marker}/electron/cli.js .",
            ]
        )

        with patch(
            "felixo_launcher.process.subprocess.check_output", return_value=pgrep_output
        ), patch("felixo_launcher.process.own_process_tree_pids", return_value=set()):
            self.assertEqual(process_module.find_stale_app_pids(), [4001, 4004])

    def test_never_kills_the_launcher_or_its_own_process_group(self) -> None:
        marker = str(paths.APP_DIR / "node_modules")
        pgrep_output = f"777 node {marker}/vite/bin/vite.js\n888 node {marker}/vite/x.js"

        with patch(
            "felixo_launcher.process.subprocess.check_output", return_value=pgrep_output
        ), patch("felixo_launcher.process.own_process_tree_pids", return_value={777}):
            self.assertEqual(process_module.find_stale_app_pids(), [888])

    def test_returns_no_pids_when_pgrep_is_unavailable(self) -> None:
        with patch(
            "felixo_launcher.process.subprocess.check_output", side_effect=FileNotFoundError
        ):
            self.assertEqual(process_module.find_stale_app_pids(), [])

    def test_returns_no_pids_when_pgrep_matches_nothing(self) -> None:
        with patch(
            "felixo_launcher.process.subprocess.check_output",
            side_effect=subprocess.CalledProcessError(1, "pgrep"),
        ):
            self.assertEqual(process_module.find_stale_app_pids(), [])

    def test_ignores_malformed_pgrep_output(self) -> None:
        with patch(
            "felixo_launcher.process.subprocess.check_output", return_value="\nnot-a-pid line\n\n"
        ), patch("felixo_launcher.process.own_process_tree_pids", return_value=set()):
            self.assertEqual(process_module.find_stale_app_pids(), [])

    def test_escalates_to_sigkill_only_for_survivors(self) -> None:
        with patch("felixo_launcher.process.find_stale_app_pids", return_value=[10, 20]), patch(
            "felixo_launcher.process.time.sleep"
        ), patch(
            "felixo_launcher.process.process_is_alive", side_effect=lambda pid: pid == 20
        ), patch("felixo_launcher.process.terminate_pids") as terminate:
            process_module.cleanup_app_processes()

        self.assertEqual(terminate.call_args_list[0].args, ([10, 20], signal.SIGTERM))
        self.assertEqual(terminate.call_args_list[1].args, ([20], signal.SIGKILL))

    def test_terminate_ignores_processes_that_already_exited(self) -> None:
        with patch(
            "felixo_launcher.process.os.kill", side_effect=[ProcessLookupError, PermissionError, None]
        ) as kill:
            process_module.terminate_pids([1, 2, 3], signal.SIGTERM)

        self.assertEqual(kill.call_count, 3)

    def test_process_is_alive_treats_permission_denied_as_running(self) -> None:
        with patch("felixo_launcher.process.os.kill", side_effect=PermissionError):
            self.assertTrue(process_module.process_is_alive(1))

        with patch("felixo_launcher.process.os.kill", side_effect=ProcessLookupError):
            self.assertFalse(process_module.process_is_alive(1))




class StopProcessTests(unittest.TestCase):
    def test_signals_the_whole_group_so_vite_and_electron_both_exit(self) -> None:
        process = MagicMock()
        process.pid = 4242

        with patch.object(process_module.os, "name", "posix"), patch(
            "felixo_launcher.process.os.getpgid", return_value=4242, create=True
        ), patch("felixo_launcher.process.os.killpg", create=True) as killpg:
            process_module.signal_process_group(process, signal.SIGTERM)

        killpg.assert_called_once_with(4242, signal.SIGTERM)

    def test_falls_back_to_single_process_when_the_group_is_gone(self) -> None:
        """Ctrl+C must not surface a raw ProcessLookupError traceback."""
        process = MagicMock()
        process.pid = 4242

        with patch.object(process_module.os, "name", "posix"), patch(
            "felixo_launcher.process.os.getpgid", side_effect=ProcessLookupError, create=True
        ):
            process_module.signal_process_group(process, signal.SIGTERM)

        process.terminate.assert_called_once()

    def test_swallows_errors_when_the_process_is_already_reaped(self) -> None:
        process = MagicMock()
        process.pid = 4242
        process.terminate.side_effect = ProcessLookupError

        with patch.object(process_module.os, "name", "posix"), patch(
            "felixo_launcher.process.os.getpgid", side_effect=ProcessLookupError, create=True
        ):
            process_module.signal_process_group(process, signal.SIGTERM)

    def test_reaps_child_from_a_signal_handler_without_falsely_timing_out(self) -> None:
        """Regression: `stop_process` runs from the SIGTERM handler while the
        main thread is blocked in `Popen.wait()`. There, `Popen.poll()` blocks on
        the lock that outer wait holds and never reports the exit, so relying on
        it made a clean Ctrl+C hang for ~16s and print a false failure. Only a
        direct `os.waitpid` sees the real status."""
        process = MagicMock()
        process.pid = 4242
        process.returncode = None
        process.poll.return_value = None  # what a blocked Popen reports

        with patch.object(process_module.os, "name", "posix"), patch(
            "felixo_launcher.process.os.waitpid", return_value=(4242, 0), create=True
        ):
            self.assertTrue(process_module.process_has_exited(process))

    def test_treats_already_reaped_child_as_exited(self) -> None:
        process = MagicMock()
        process.pid = 4242
        process.returncode = None

        with patch.object(process_module.os, "name", "posix"), patch(
            "felixo_launcher.process.os.waitpid", side_effect=ChildProcessError, create=True
        ):
            self.assertTrue(process_module.process_has_exited(process))

    def test_reports_still_running_while_the_child_is_alive(self) -> None:
        process = MagicMock()
        process.pid = 4242
        process.returncode = None

        with patch.object(process_module.os, "name", "posix"), patch(
            "felixo_launcher.process.os.waitpid", return_value=(0, 0), create=True
        ):
            self.assertFalse(process_module.process_has_exited(process))

    def test_wait_for_exit_gives_up_after_the_timeout(self) -> None:
        process = MagicMock()

        with patch("felixo_launcher.process.process_has_exited", return_value=False), patch(
            "felixo_launcher.process.time.sleep"
        ):
            self.assertFalse(process_module.wait_for_exit(process, timeout=0))

    def test_escalates_to_sigkill_only_when_sigterm_was_not_enough(self) -> None:
        process = MagicMock()
        process.poll.return_value = None

        with patch("felixo_launcher.process.wait_for_exit", side_effect=[False, True]), patch(
            "felixo_launcher.process.signal_process_group"
        ) as signal_group, patch("felixo_launcher.process.cleanup_app_processes"), patch(
            "felixo_launcher.process.print"
        ) as printed:
            process_module.stop_process(process)

        self.assertEqual(
            [call.args[1] for call in signal_group.call_args_list],
            [signal.SIGTERM, signal.SIGKILL],
        )
        printed.assert_not_called()

    def test_waits_far_less_after_sigkill_than_before_it(self) -> None:
        """SIGKILL cannot be caught, so only the kernel reap takes any time.
        Giving it the same generous budget as the graceful stop added seconds
        to every Ctrl+C for no benefit."""
        self.assertLess(
            process_module.FORCED_STOP_TIMEOUT,
            process_module.GRACEFUL_STOP_TIMEOUT,
        )

    def test_stops_a_stubborn_process_within_the_graceful_budget(self) -> None:
        """A process that ignores SIGTERM must still be stopped, and the wait
        is bounded by the graceful timeout rather than an open-ended hang."""
        waits: list[float] = []

        def record(_process: object, timeout: float) -> bool:
            waits.append(timeout)
            return len(waits) > 1  # times out on SIGTERM, succeeds after SIGKILL

        process = MagicMock()
        process.poll.return_value = None

        with patch("felixo_launcher.process.wait_for_exit", side_effect=record), patch(
            "felixo_launcher.process.signal_process_group"
        ), patch("felixo_launcher.process.cleanup_app_processes"), patch(
            "felixo_launcher.process.print"
        ) as printed:
            process_module.stop_process(process)

        self.assertEqual(
            waits,
            [
                process_module.GRACEFUL_STOP_TIMEOUT,
                process_module.FORCED_STOP_TIMEOUT,
            ],
        )
        printed.assert_not_called()

    def test_does_not_warn_when_sigterm_alone_stops_the_app(self) -> None:
        process = MagicMock()
        process.poll.return_value = None

        with patch("felixo_launcher.process.wait_for_exit", return_value=True), patch(
            "felixo_launcher.process.signal_process_group"
        ) as signal_group, patch("felixo_launcher.process.cleanup_app_processes"), patch(
            "felixo_launcher.process.print"
        ) as printed:
            process_module.stop_process(process)

        self.assertEqual(len(signal_group.call_args_list), 1)
        printed.assert_not_called()

    def test_uses_plain_terminate_and_kill_on_windows(self) -> None:
        process = MagicMock()

        with patch.object(process_module.os, "name", "nt"):
            process_module.signal_process_group(process, signal.SIGTERM)
            process_module.signal_process_group(process, signal.SIGKILL)

        process.terminate.assert_called_once()
        process.kill.assert_called_once()




class IsAppProcessCommandArgv0Test(unittest.TestCase):
    """A limpeza só pode matar o que o launcher de fato inicia.

    O filtro exigia apenas que a linha de comando *contivesse* algo como
    `/vite` — e o próprio caminho `.../node_modules/vite/...` já contém. Um
    editor aberto num arquivo dessa pasta passava no teste e levava SIGTERM
    seguido de SIGKILL, com perda de trabalho não salvo.
    """

    MARKER = "/home/dev/proj/app/node_modules"

    def test_nao_mata_processo_que_apenas_menciona_o_caminho(self) -> None:
        alheios = [
            f"vim {self.MARKER}/vite/dist/node/chunks/dep-abc.js",
            f"less {self.MARKER}/vite/CHANGELOG.md",
            f"tail -f {self.MARKER}/electron/path.txt",
            f"code {self.MARKER}/electron/index.js",
            f"grep -r foo {self.MARKER}",
        ]

        for comando in alheios:
            with self.subTest(comando=comando):
                self.assertFalse(
                    process_module.is_app_process_command(comando, self.MARKER),
                    "processo alheio não pode ser elegível para a limpeza",
                )

    def test_ainda_mata_os_processos_que_o_launcher_inicia(self) -> None:
        nossos = [
            f"node {self.MARKER}/vite/bin/vite.js",
            f"node {self.MARKER}/.bin/concurrently -k -n VITE,ELECTRON",
            f"{self.MARKER}/electron/dist/electron .",
            f"node {self.MARKER}/wait-on/bin/wait-on http://127.0.0.1:5173",
        ]

        for comando in nossos:
            with self.subTest(comando=comando):
                self.assertTrue(
                    process_module.is_app_process_command(comando, self.MARKER),
                    "um processo iniciado pelo launcher deveria ser elegível",
                )

    def test_exige_o_marcador_do_checkout(self) -> None:
        # Outro checkout do mesmo projeto não é da nossa conta.
        self.assertFalse(
            process_module.is_app_process_command(
                "node /outro/checkout/app/node_modules/vite/bin/vite.js",
                self.MARKER,
            )
        )


class WnohangAttributeAccessTests(unittest.TestCase):
    """`os.WNOHANG`, `os.getpgid` e `os.killpg` não existem como atributos do
    módulo `os` no Windows.

    Os testes de `StopProcessTests` acima forçam `os.name = "posix"` para
    exercitar esses ramos mesmo rodando lá, mockando as três funções — mas
    `patch()` sem `create=True` exige que o atributo já exista para poder
    substituí-lo, e o Windows nunca teve nenhum dos três. E mesmo mockado,
    `os.waitpid(pid, os.WNOHANG)` acessava `os.WNOHANG` como valor literal
    antes de o mock interceptar a chamada, o que também estourava.

    Essa combinação era a causa do `ERROR` na suíte inteira do launcher no
    job windows-latest do CI: uma falha de acesso a atributo mascarando o
    resultado dos testes de verdade.
    """

    def test_process_has_exited_usa_getattr_para_wnohang(self) -> None:
        process = MagicMock()
        process.pid = 4242
        process.returncode = None

        # Remove o atributo do objeto os REAL usado pelo módulo, reproduzindo
        # o Windows de verdade — não um valor trocado, ausência mesmo.
        had_attr = hasattr(process_module.os, "WNOHANG")
        original = getattr(process_module.os, "WNOHANG", None)
        if had_attr:
            del process_module.os.WNOHANG

        try:
            with patch.object(process_module.os, "name", "posix"), patch(
                "felixo_launcher.process.os.waitpid", return_value=(0, 0), create=True
            ):
                # Não pode levantar AttributeError.
                process_module.process_has_exited(process)
        finally:
            if had_attr:
                process_module.os.WNOHANG = original
