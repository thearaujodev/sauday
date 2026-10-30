import os
import tempfile
import unittest
from datetime import datetime
from unittest import mock

import database
from reminders import processar_lembretes, verificar_lembretes


def agendamento_base(**alteracoes):
    agendamento = {
        "id": 1,
        "title": "Consulta de teste",
        "type": "consulta",
        "date": "2026-10-20",
        "time": "10:00",
        "location": "Clínica Teste",
        "notes": None,
        "reminder_minutes": 1440,
        "reminded_at": None,
    }
    agendamento.update(alteracoes)
    return agendamento


class BancoTemporario(unittest.TestCase):
    """Base: cada teste usa um banco SQLite novo, sem tocar no banco real."""

    def setUp(self):
        self.pasta = tempfile.TemporaryDirectory()
        caminho = os.path.join(self.pasta.name, "teste.db")

        self.patch = mock.patch("database.CAMINHO_BANCO", caminho)
        self.patch.start()
        database.criar_tabela()

    def tearDown(self):
        self.patch.stop()
        self.pasta.cleanup()


class VerificarLembretesTest(unittest.TestCase):
    """Lógica pura: não toca no banco."""

    def test_antes_da_janela_nao_lembra(self):
        agora = datetime(2026, 10, 19, 9, 59)
        self.assertEqual(verificar_lembretes([agendamento_base()], agora), [])

    def test_no_inicio_da_janela_lembra(self):
        agora = datetime(2026, 10, 19, 10, 0)
        resultado = verificar_lembretes([agendamento_base()], agora)

        self.assertEqual(len(resultado), 1)
        self.assertEqual(resultado[0]["reminder_at"], "2026-10-19 10:00")

    def test_no_horario_do_agendamento_nao_lembra_mais(self):
        agora = datetime(2026, 10, 20, 10, 0)
        self.assertEqual(verificar_lembretes([agendamento_base()], agora), [])

    def test_ja_lembrado_e_ignorado(self):
        agora = datetime(2026, 10, 19, 12, 0)
        ja_lembrado = agendamento_base(reminded_at="2026-10-19 10:00:00")
        self.assertEqual(verificar_lembretes([ja_lembrado], agora), [])

    def test_dados_invalidos_sao_ignorados_sem_erro(self):
        agora = datetime(2026, 10, 19, 12, 0)
        invalido = agendamento_base(date="20/10/2026")
        self.assertEqual(verificar_lembretes([invalido], agora), [])


class ProcessarLembretesTest(BancoTemporario):
    """Ciclo completo com um banco SQLite temporário."""

    def setUp(self):
        super().setUp()
        self.id = database.criar_agendamento(
            "Consulta de teste", "consulta",
            "2026-10-20", "10:00",
            "Clínica Teste", "Obs original", 1440
        )

    def atualizar(self, data="2026-10-20", horario="10:00",
                  observacoes="Obs original", lembrete=1440, titulo="Consulta de teste"):
        return database.atualizar_agendamento(
            self.id, titulo, "consulta",
            data, horario, "Clínica Teste", observacoes, lembrete
        )

    def avisos(self):
        return database.listar_avisos()

    def test_envia_uma_unica_vez_e_registra_o_aviso(self):
        notificados = []
        agora = datetime(2026, 10, 19, 10, 0)

        self.assertEqual(processar_lembretes(agora, notificados.append), 1)
        self.assertEqual(processar_lembretes(agora, notificados.append), 0)

        self.assertEqual(len(notificados), 1)
        self.assertIsNotNone(database.buscar_agendamento(self.id)["reminded_at"])

        avisos, nao_lidos = self.avisos()
        self.assertEqual(len(avisos), 1)
        self.assertEqual(nao_lidos, 1)
        aviso = avisos[0]
        self.assertEqual(aviso["appointment_id"], self.id)
        self.assertEqual((aviso["date"], aviso["time"]), ("2026-10-20", "10:00"))
        self.assertEqual(aviso["reminder_at"], "2026-10-19 10:00")
        self.assertEqual(aviso["created_at"], "2026-10-19 10:00:00")
        self.assertIsNone(aviso["read_at"])

    def test_nao_envia_fora_da_janela(self):
        notificados = []
        agora = datetime(2026, 10, 18, 12, 0)

        self.assertEqual(processar_lembretes(agora, notificados.append), 0)
        self.assertEqual(notificados, [])
        self.assertEqual(self.avisos(), ([], 0))

    def test_registro_concorrente_gera_um_unico_aviso(self):
        # Simula o site e o serviço tentando registrar o mesmo lembrete.
        lembrete = database.buscar_agendamento(self.id)
        primeiro = database.registrar_lembrete(lembrete, "2026-10-19 10:00", "2026-10-19 10:00:00")
        segundo = database.registrar_lembrete(lembrete, "2026-10-19 10:00", "2026-10-19 10:00:05")

        self.assertIsNotNone(primeiro)
        self.assertIsNone(segundo)
        self.assertEqual(len(self.avisos()[0]), 1)

    def test_falha_no_canal_extra_mantem_o_aviso(self):
        def notificador_com_erro(_):
            raise RuntimeError("falha simulada")

        agora = datetime(2026, 10, 19, 10, 0)

        with self.assertLogs("healthreminder.reminders", level="ERROR"):
            gerados = processar_lembretes(agora, notificador_com_erro)

        self.assertEqual(gerados, 1)
        self.assertEqual(self.avisos()[1], 1)

    def test_remarcar_rearma_o_lembrete(self):
        notificados = []

        processar_lembretes(datetime(2026, 10, 19, 10, 0), notificados.append)
        self.assertEqual(len(notificados), 1)

        self.atualizar(data="2026-10-25")
        self.assertIsNone(database.buscar_agendamento(self.id)["reminded_at"])

        processar_lembretes(datetime(2026, 10, 24, 10, 30), notificados.append)
        self.assertEqual(len(notificados), 2)

        avisos, _ = self.avisos()
        self.assertEqual(sorted(a["date"] for a in avisos), ["2026-10-20", "2026-10-25"])

    def test_editar_so_observacoes_nao_rearma(self):
        notificados = []
        agora = datetime(2026, 10, 19, 12, 0)

        processar_lembretes(agora, notificados.append)
        self.assertEqual(len(notificados), 1)

        self.atualizar(observacoes="Levar exames anteriores")
        self.assertIsNotNone(database.buscar_agendamento(self.id)["reminded_at"])

        processar_lembretes(agora, notificados.append)
        self.assertEqual(len(notificados), 1)

    def test_aviso_guarda_os_dados_da_epoca(self):
        processar_lembretes(datetime(2026, 10, 19, 12, 0), lambda _: None)
        self.atualizar(titulo="Título novo")

        self.assertEqual(self.avisos()[0][0]["title"], "Consulta de teste")

    def test_excluir_compromisso_remove_seus_avisos(self):
        processar_lembretes(datetime(2026, 10, 19, 12, 0), lambda _: None)
        self.assertEqual(len(self.avisos()[0]), 1)

        database.excluir_agendamento(self.id)

        self.assertEqual(self.avisos(), ([], 0))

    def test_marcar_avisos_como_lidos(self):
        outro = database.criar_agendamento(
            "Exame", "exame", "2026-10-20", "11:00", None, None, 1440
        )
        processar_lembretes(datetime(2026, 10, 19, 12, 0), lambda _: None)
        avisos, nao_lidos = self.avisos()
        self.assertEqual(nao_lidos, 2)

        self.assertEqual(database.marcar_aviso_lido(avisos[0]["id"], "2026-10-19 12:01:00"), 1)
        self.assertEqual(self.avisos()[1], 1)

        # Marcar de novo não altera a data da primeira leitura.
        database.marcar_aviso_lido(avisos[0]["id"], "2026-10-19 13:00:00")
        lido = next(a for a in self.avisos()[0] if a["id"] == avisos[0]["id"])
        self.assertEqual(lido["read_at"], "2026-10-19 12:01:00")

        self.assertEqual(database.marcar_aviso_lido(9999, "2026-10-19 12:01:00"), 0)
        self.assertEqual(database.marcar_todos_avisos_lidos("2026-10-19 12:02:00"), 1)
        self.assertEqual(self.avisos()[1], 0)
        self.assertIsNotNone(outro)


if __name__ == "__main__":
    unittest.main()
