from datetime import datetime, timedelta

import app as aplicacao
from test_reminders import BancoTemporario


class ApiTest(BancoTemporario):
    """Testa as rotas pela API, como o site faz."""

    def setUp(self):
        super().setUp()
        self.cliente = aplicacao.app.test_client()

    def compromisso(self, **alteracoes):
        daqui_a_1h = datetime.now() + timedelta(hours=1)
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

    def test_paginas_e_versao(self):
        for rota, trecho in (("/", "Alpha 0.1"), ("/sobre", "2026110137")):
            resposta = self.cliente.get(rota)
            self.assertEqual(resposta.status_code, 200)
            self.assertIn(trecho, resposta.get_data(as_text=True))

        sobre = self.cliente.get("/sobre").get_data(as_text=True)
        self.assertIn("sua saúde, no seu dia", sobre)
        self.assertNotIn("Checkpoint", sobre)

        self.assertEqual(self.cliente.get("/nao-existe").status_code, 404)
        self.assertEqual(self.cliente.get("/api/nao-existe").get_json()["error"], "Recurso não encontrado.")

    def test_crud_completo(self):
        criado = self.cliente.post("/api/appointments", json=self.compromisso())
        self.assertEqual(criado.status_code, 201)
        id_ = criado.get_json()["id"]

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

    def test_validacoes(self):
        casos = [
            self.compromisso(date="20/10/2026"),
            self.compromisso(time="25:00"),
            self.compromisso(title="   "),
            self.compromisso(title="x" * 121),
            self.compromisso(reminder_minutes=True),
            self.compromisso(reminder_minutes=-5),
        ]
        for corpo in casos:
            self.assertEqual(self.cliente.post("/api/appointments", json=corpo).status_code, 400, corpo)

        sem_json = self.cliente.post("/api/appointments", data="texto", content_type="text/plain")
        self.assertEqual(sem_json.status_code, 400)

    def test_fluxo_de_avisos(self):
        id_ = self.cliente.post("/api/appointments", json=self.compromisso()).get_json()["id"]
        self.cliente.post("/api/appointments", json=self.compromisso(
            title="Exame distante",
            date=(datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d")
        ))

        self.assertEqual(len(self.cliente.get("/api/reminders").get_json()), 1)

        self.assertEqual(self.cliente.post("/api/reminders/process").get_json()["generated"], 1)
        self.assertEqual(self.cliente.post("/api/reminders/process").get_json()["generated"], 0)
        self.assertEqual(self.cliente.get("/api/reminders").get_json(), [])

        lista = self.cliente.get("/api/notifications").get_json()
        self.assertEqual(lista["unread"], 1)
        aviso = lista["notifications"][0]
        self.assertEqual(aviso["appointment_id"], id_)
        self.assertEqual(aviso["title"], "Consulta com cardiologista")

        self.assertEqual(self.cliente.post(f"/api/notifications/{aviso['id']}/read").status_code, 200)
        self.assertEqual(self.cliente.get("/api/notifications").get_json()["unread"], 0)
        self.assertEqual(self.cliente.post("/api/notifications/999/read").status_code, 404)
        self.assertEqual(self.cliente.post("/api/notifications/read-all").get_json()["updated"], 0)
