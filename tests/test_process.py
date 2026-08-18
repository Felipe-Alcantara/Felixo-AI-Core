"""Tests for stopping the app process tree.

Shutdown also runs from a signal handler, which constrains how the child can
be reaped.
"""

from __future__ import annotations

import signal
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from felixo_launcher import process as process_module


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

        # `os.killpg` também precisa ser mockado, e não só `getpgid`: no
        # Windows o atributo não existe no módulo `os`, e a chamada
        # `os.killpg(os.getpgid(...))` resolve o nome externo antes de o
        # `getpgid` interno chegar a levantar — o AttributeError vinha de
        # `killpg`, fora do `except ProcessLookupError`.
        with patch.object(process_module.os, "name", "posix"), patch(
            "felixo_launcher.process.os.getpgid", side_effect=ProcessLookupError, create=True
        ), patch("felixo_launcher.process.os.killpg", create=True):
            process_module.signal_process_group(process, signal.SIGTERM)

        process.terminate.assert_called_once()

    def test_swallows_errors_when_the_process_is_already_reaped(self) -> None:
        process = MagicMock()
        process.pid = 4242
        process.terminate.side_effect = ProcessLookupError

        with patch.object(process_module.os, "name", "posix"), patch(
            "felixo_launcher.process.os.getpgid", side_effect=ProcessLookupError, create=True
        ), patch("felixo_launcher.process.os.killpg", create=True):
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
        ) as signal_group, patch("felixo_launcher.process.print") as printed:
            process_module.stop_process(process)

        # O escalonamento é o `force=True` da segunda chamada, não um número
        # de sinal diferente: SIGKILL não existe no Windows, então a intenção
        # é que viaja, e cada plataforma a traduz como sabe.
        self.assertEqual(
            [(call.args[1], call.kwargs.get("force", False)) for call in signal_group.call_args_list],
            [(signal.SIGTERM, False), (signal.SIGTERM, True)],
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
        ), patch("felixo_launcher.process.print") as printed:
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
        ) as signal_group, patch("felixo_launcher.process.print") as printed:
            process_module.stop_process(process)

        self.assertEqual(len(signal_group.call_args_list), 1)
        printed.assert_not_called()

    def test_uses_plain_terminate_and_kill_on_windows(self) -> None:
        process = MagicMock()

        with patch.object(process_module.os, "name", "nt"):
            process_module.signal_process_group(process, signal.SIGTERM)
            process_module.signal_process_group(process, signal.SIGTERM, force=True)

        process.terminate.assert_called_once()
        process.kill.assert_called_once()

    def test_stop_process_nao_le_sigkill_direto_do_signal(self) -> None:
        """`stop_process` roda em toda parada do app, Windows incluído, e
        escalava lendo `signal.SIGKILL` — que não existe lá. O escalonamento
        precisa continuar acontecendo sem depender desse atributo."""
        process = MagicMock()
        process.poll.return_value = None
        sem_sigkill = {
            name: value for name, value in vars(signal).items() if name != "SIGKILL"
        }

        with patch.object(
            process_module, "signal", SimpleNamespace(**sem_sigkill)
        ), patch(
            "felixo_launcher.process.wait_for_exit", side_effect=[False, True]
        ), patch("felixo_launcher.process.signal_process_group") as signal_group, patch(
            "felixo_launcher.process.print"
        ):
            process_module.stop_process(process)

        self.assertEqual(len(signal_group.call_args_list), 2)

    def test_nao_depende_de_signal_sigkill_que_nao_existe_no_windows(self) -> None:
        """`signal.SIGKILL` só existe no POSIX. O ramo do Windows comparava o
        sinal recebido contra ele, então a primeira parada de processo lá
        levantava AttributeError — um Ctrl+C viraria traceback no app
        instalado, que é justamente o que este módulo existe para evitar."""
        process = MagicMock()

        with patch.object(process_module.os, "name", "nt"), patch.object(
            process_module, "signal", self.signal_sem_sigkill()
        ):
            process_module.signal_process_group(process, signal.SIGTERM)

        process.terminate.assert_called_once()
        process.kill.assert_not_called()

    def test_ainda_mata_a_forca_o_processo_teimoso_sem_sigkill(self) -> None:
        """Sem SIGKILL na plataforma, o escalonamento não pode virar um segundo
        pedido educado: um processo que ignorou o `terminate()` continuaria
        ignorando o próximo. O passo forçado tem que chamar `kill()`, que no
        Windows é o TerminateProcess de verdade."""
        process = MagicMock()
        process.poll.return_value = None

        with patch.object(process_module.os, "name", "nt"), patch.object(
            process_module, "signal", self.signal_sem_sigkill()
        ), patch(
            "felixo_launcher.process.wait_for_exit", side_effect=[False, True]
        ), patch("felixo_launcher.process.print"):
            process_module.stop_process(process)

        process.terminate.assert_called_once()
        process.kill.assert_called_once()

    def signal_sem_sigkill(self) -> SimpleNamespace:
        """O módulo `signal` como ele é no Windows: sem SIGKILL."""
        return SimpleNamespace(
            **{name: value for name, value in vars(signal).items() if name != "SIGKILL"}
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
