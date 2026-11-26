from datetime import datetime, timedelta
from unittest import mock

import app as aplicacao
import database
from test_reminders import BancoTemporario

# Momento fixo no horário de Brasília: os testes não dependem do relógio
# nem do fuso do computador em que rodam.
AGORA = datetime(2026, 10, 19, 9, 30)


class ApiTest(BancoTemporario):
    """Testa as rotas pela API, como o site faz."""

    def setUp(self):
        super().setUp()
        self.cliente = aplicacao.app.test_client()

        relogio = mock.patch("app.agora_brasilia", return_value=AGORA)
        relogio.start()
        self.addCleanup(relogio.stop)

    def compromisso(self, **alteracoes):
        daqui_a_1h = AGORA + timedelta(hours=1)
        corpo = {
            "title": "Consulta com cardiologista",
            "type": "consulta",
            "date": daqui_a_1h.strftime("%Y-%m-%d"),
            "time": daqui_a_1h.strftime("%H:%M"),
            "location": "UBS Vila Mariana",
            "notes": None,
            "reminder_minutes": 1440,
        }
        corpo.update(alteracoes)
        return corpo

    def criar(self, **alteracoes):
        resposta = self.cliente.post("/api/appointments", json=self.compromisso(**alteracoes))
        self.assertEqual(resposta.status_code, 201, resposta.get_json())
        return resposta.get_json()["id"]

    def test_paginas_e_versao(self):
        for rota, trecho in (("/", "1.0"), ("/historico", "Histórico"), ("/sobre", "2026110137")):
            resposta = self.cliente.get(rota)
            self.assertEqual(resposta.status_code, 200)
            self.assertIn(trecho, resposta.get_data(as_text=True))

        sobre = self.cliente.get("/sobre").get_data(as_text=True)
        self.assertIn("sua saúde, no seu dia", sobre)
        self.assertNotIn("Checkpoint", sobre)

        self.assertEqual(self.cliente.get("/nao-existe").status_code, 404)
        self.assertEqual(self.cliente.get("/api/nao-existe").get_json()["error"], "Recurso não encontrado.")

    def test_service_worker_na_raiz(self):
        resposta = self.cliente.get("/sw.js")
        self.assertEqual(resposta.status_code, 200)
        self.assertTrue(resposta.content_type.startswith("text/javascript"))
        self.assertEqual(resposta.headers["Cache-Control"], "no-cache")
        self.assertIn("notificationclick", resposta.get_data(as_text=True))
        resposta.close()

    def test_status_informa_hora_de_brasilia(self):
        dados = self.cliente.get("/api/status").get_json()
        self.assertEqual(dados["versao"], aplicacao.VERSAO)
        self.assertEqual(dados["fuso"], "America/Sao_Paulo")
        self.assertIsInstance(dados["agora_ms"], int)
        self.assertTrue(dados["agora"].endswith("-03:00"))

    def test_crud_completo(self):
        id_ = self.criar()

        atualizado = self.cliente.put(
            f"/api/appointments/{id_}", json=self.compromisso(title="Retorno cardiologista")
        )
        self.assertEqual(atualizado.status_code, 200)
        self.assertEqual(
            self.cliente.get(f"/api/appointments/{id_}").get_json()["title"], "Retorno cardiologista"
        )

        self.assertEqual(self.cliente.delete(f"/api/appointments/{id_}").status_code, 200)
        self.assertEqual(self.cliente.delete(f"/api/appointments/{id_}").status_code, 404)
        self.assertEqual(self.cliente.put("/api/appointments/999", json=self.compromisso()).status_code, 404)
        self.assertEqual(self.cliente.patch("/api/appointments/999", json={"notify": False}).status_code, 404)

    def test_validacoes(self):
        casos = [
            self.compromisso(date="20/10/2026"),
            self.compromisso(date="2026-10-2"),
            self.compromisso(time="25:00"),
            self.compromisso(time="9:5"),
            self.compromisso(title="   "),
            self.compromisso(title="x" * 121),
            self.compromisso(reminder_minutes=True),
            self.compromisso(reminder_minutes=-5),
            self.compromisso(reminder_minutes=30 * 24 * 60 + 1),
            self.compromisso(notify="sim"),
        ]
        for corpo in casos:
            self.assertEqual(self.cliente.post("/api/appointments", json=corpo).status_code, 400, corpo)

        sem_json = self.cliente.post("/api/appointments", data="texto", content_type="text/plain")
        self.assertEqual(sem_json.status_code, 400)

    def test_recusa_datas_e_horarios_que_ja_passaram(self):
        ontem = self.cliente.post("/api/appointments", json=self.compromisso(date="2026-10-18"))
        self.assertEqual(ontem.status_code, 400)
        self.assertIn("anterior a hoje (19/10/2026)", ontem.get_json()["error"])

        for horario in ("08:00", "09:30"):
            hoje_cedo = self.cliente.post("/api/appointments", json=self.compromisso(date="2026-10-19", time=horario))
            self.assertEqual(hoje_cedo.status_code, 400, horario)
            self.assertIn("depois das 09:30 (horário de Brasília)", hoje_cedo.get_json()["error"])

        # Um minuto depois de agora e qualquer dia seguinte são aceitos.
        self.criar(date="2026-10-19", time="09:31")
        self.criar(date="2026-10-20", time="07:00")

    def test_compromisso_do_historico_mantem_a_data_original(self):
        # Compromisso antigo, de antes da regra (ou que simplesmente já passou).
        id_ = database.criar_agendamento(
            "Vacina da gripe", "vacina", "2026-10-10", "10:00", "UBS", None, 60
        )

        anotado = self.cliente.put(
            f"/api/appointments/{id_}",
            json=self.compromisso(title="Vacina da gripe", type="vacina", date="2026-10-10",
                                  time="10:00", notes="Tomei sem reação.")
        )
        self.assertEqual(anotado.status_code, 200)
        self.assertEqual(self.cliente.get(f"/api/appointments/{id_}").get_json()["notes"], "Tomei sem reação.")

        self.assertEqual(self.cliente.patch(f"/api/appointments/{id_}", json={"location": "Farmácia"}).status_code, 200)

        # Remarcar para outra data passada não pode; para o futuro, pode.
        self.assertEqual(self.cliente.patch(f"/api/appointments/{id_}", json={"date": "2026-10-11"}).status_code, 400)
        self.assertEqual(self.cliente.patch(f"/api/appointments/{id_}", json={"date": "2027-04-10"}).status_code, 200)

    def test_notificacao_por_compromisso(self):
        id_ = self.criar(notify=False)
        self.assertIs(self.cliente.get(f"/api/appointments/{id_}").get_json()["notify"], False)

        # Desligada: o lembrete não gera aviso, mesmo dentro da janela.
        self.assertEqual(self.cliente.post("/api/reminders/process").get_json()["generated"], 0)

        ligar = self.cliente.patch(f"/api/appointments/{id_}", json={"notify": True})
        self.assertEqual(ligar.status_code, 200)
        self.assertEqual(self.cliente.post("/api/reminders/process").get_json()["generated"], 1)

        # Um PUT sem "notify" mantém a escolha atual.
        self.cliente.patch(f"/api/appointments/{id_}", json={"notify": False})
        self.cliente.put(f"/api/appointments/{id_}", json=self.compromisso(title="Outro título"))
        self.assertIs(self.cliente.get(f"/api/appointments/{id_}").get_json()["notify"], False)

        self.assertIs(self.cliente.get(f"/api/appointments/{self.criar()}").get_json()["notify"], True)

        for corpo in ({}, {"reminded_at": None}, {"notify": "nao"}):
            self.assertEqual(self.cliente.patch(f"/api/appointments/{id_}", json=corpo).status_code, 400, corpo)

    def test_fluxo_de_avisos(self):
        id_ = self.criar()
        self.criar(title="Exame distante", date=(AGORA + timedelta(days=10)).strftime("%Y-%m-%d"))

        self.assertEqual(len(self.cliente.get("/api/reminders").get_json()), 1)

        processado = self.cliente.post("/api/reminders/process").get_json()
        self.assertEqual(processado["generated"], 1)
        self.assertIn("agora_ms", processado)
        self.assertEqual(self.cliente.post("/api/reminders/process").get_json()["generated"], 0)
        self.assertEqual(self.cliente.get("/api/reminders").get_json(), [])

        lista = self.cliente.get("/api/notifications").get_json()
        self.assertEqual(lista["unread"], 1)
        aviso = lista["notifications"][0]
        self.assertEqual(aviso["appointment_id"], id_)
        self.assertEqual(aviso["title"], "Consulta com cardiologista")
        self.assertEqual(aviso["created_at"], "2026-10-19 09:30:00")

        self.assertEqual(self.cliente.post(f"/api/notifications/{aviso['id']}/read").status_code, 200)
        self.assertEqual(self.cliente.get("/api/notifications").get_json()["unread"], 0)
        self.assertEqual(self.cliente.post("/api/notifications/999/read").status_code, 404)
        self.assertEqual(self.cliente.post("/api/notifications/read-all").get_json()["updated"], 0)

    def test_arquivo_de_calendario(self):
        id_ = self.criar(title="Consulta, cardiologia; retorno", notes="Levar exames\nanteriores")

        resposta = self.cliente.get(f"/api/appointments/{id_}/calendar.ics")
        self.assertEqual(resposta.status_code, 200)
        self.assertTrue(resposta.content_type.startswith("text/calendar"))
        self.assertIn('filename="sauday-consulta-cardiologia-retorno.ics"', resposta.headers["Content-Disposition"])

        texto = resposta.get_data(as_text=True)
        self.assertIn("DTSTART:20261019T133000Z", texto)  # 10:30 em Brasília = 13:30 UTC
        self.assertIn("SUMMARY:Consulta\\, cardiologia\\; retorno", texto)
        self.assertIn("TRIGGER:-PT1440M", texto)
        self.assertTrue(all(len(linha.encode()) <= 75 for linha in texto.split("\r\n")))

        self.cliente.patch(f"/api/appointments/{id_}", json={"notify": False})
        sem_alarme = self.cliente.get(f"/api/appointments/{id_}/calendar.ics").get_data(as_text=True)
        self.assertNotIn("VALARM", sem_alarme)

        self.assertEqual(self.cliente.get("/api/appointments/999/calendar.ics").status_code, 404)
