import logging
import mimetypes
import os
import re
import time
from datetime import datetime, timezone

from flask import (
    Flask,
    Response,
    jsonify,
    render_template,
    request,
    send_from_directory
)

from calendario import gerar_ics, nome_do_arquivo
from database import (
    criar_tabela,
    criar_agendamento,
    listar_agendamentos,
    buscar_agendamento,
    atualizar_agendamento,
    excluir_agendamento,
    listar_avisos,
    marcar_aviso_lido,
    marcar_todos_avisos_lidos
)
from reminders import (
    acordar_verificador,
    iniciar_em_segundo_plano,
    listar_lembretes_pendentes,
    processar_lembretes
)
from tempo import FORMATO_REGISTRO, FUSO_BRASILIA, NOME_FUSO, agora_brasilia

# Alguns Windows registram arquivos .js como text/plain, e o navegador se
# recusa a instalar um service worker servido assim. Isto garante o tipo certo.
mimetypes.add_type("text/javascript", ".js")

NOME_PRODUTO = "Sauday"
VERSAO = "1.0"
SLOGAN = "sua saúde, no seu dia"

LIMITES_TEXTO = {"title": 120, "type": 30, "location": 120, "notes": 500}
ANTECEDENCIA_MAXIMA = 30 * 24 * 60  # 30 dias, em minutos
CAMPOS_EDITAVEIS = {
    "title", "type", "date", "time", "location", "notes", "reminder_minutes", "notify"
}

PASTA_JS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static", "js")

# static/ fica na raiz do projeto, um nível acima de backend/
app = Flask(__name__, static_folder="../static", static_url_path="/static")

criar_tabela()


@app.context_processor
def dados_do_produto():
    # Fonte única para nome, versão e slogan em todas as páginas.
    return {"produto": NOME_PRODUTO, "versao": VERSAO, "slogan": SLOGAN}


def validar_dados_agendamento(dados, agora=None, atual=None):
    """Valida o corpo de um compromisso. Retorna a mensagem de erro ou None.

    agora: momento atual em Brasília, usado para recusar datas que já passaram.
    atual: o compromisso como está no banco, quando é uma edição. Manter a data
    e o horário originais continua permitido mesmo que já tenham passado, para
    que se possa corrigir o título ou anotar como foi a consulta no histórico.
    """
    if not dados or not isinstance(dados, dict):
        return "Corpo da requisição vazio ou inválido."

    campos_obrigatorios = ["title", "type", "date", "time"]

    for campo in campos_obrigatorios:
        if campo not in dados:
            return f"Campo obrigatório ausente: {campo}."

        if not isinstance(dados[campo], str) or not dados[campo].strip():
            return f"Campo inválido: {campo}."

    for campo, limite in LIMITES_TEXTO.items():
        valor = dados.get(campo)

        if valor is not None and not isinstance(valor, str):
            return f"Campo inválido: {campo}."

        if valor and len(valor) > limite:
            return f"O campo {campo} aceita no máximo {limite} caracteres."

    try:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", dados["date"]):
            raise ValueError
        dia = datetime.strptime(dados["date"], "%Y-%m-%d")
    except ValueError:
        return "Data inválida. Use o formato AAAA-MM-DD."

    try:
        if not re.fullmatch(r"\d{2}:\d{2}", dados["time"]):
            raise ValueError
        hora = datetime.strptime(dados["time"], "%H:%M")
    except ValueError:
        return "Horário inválido. Use o formato HH:MM."

    reminder = dados.get("reminder_minutes", 1440)

    if (isinstance(reminder, bool) or not isinstance(reminder, int)
            or not 0 <= reminder <= ANTECEDENCIA_MAXIMA):
        return (
            "reminder_minutes deve ser um número inteiro entre 0 e "
            f"{ANTECEDENCIA_MAXIMA} (30 dias)."
        )

    if not isinstance(dados.get("notify", True), bool):
        return "notify deve ser true ou false."

    # Compromissos só podem ser marcados a partir de agora (horário de Brasília).
    mesmo_horario = (
        atual is not None
        and (atual["date"], atual["time"]) == (dados["date"], dados["time"])
    )

    if not mesmo_horario:
        if agora is None:
            agora = agora_brasilia()

        quando = dia.replace(hour=hora.hour, minute=hora.minute)

        if dia.date() < agora.date():
            return (
                f"A data não pode ser anterior a hoje ({agora:%d/%m/%Y}). "
                "Escolha uma data a partir de hoje."
            )

        if quando <= agora:
            return (
                "Esse horário já passou. Escolha um horário depois das "
                f"{agora:%H:%M} (horário de Brasília)."
            )

    return None


def texto_opcional(dados, campo):
    valor = dados.get(campo)

    if isinstance(valor, str):
        valor = valor.strip()

    return valor or None


def ler_json():
    return request.get_json(silent=True)


def agora_registro():
    return agora_brasilia().strftime(FORMATO_REGISTRO)


def hora_do_servidor():
    """Hora oficial para o site acertar o relógio e mostrar o horário de Brasília."""
    return {
        "agora": datetime.now(FUSO_BRASILIA).isoformat(timespec="seconds"),
        "agora_ms": int(time.time() * 1000),
        "fuso": NOME_FUSO
    }


def erro(mensagem, status):
    return jsonify({"error": mensagem}), status


# ---------------------------------------------------------------------------
# Páginas
# ---------------------------------------------------------------------------

@app.route("/")
def home():
    return render_template("index.html", pagina="inicio")


@app.route("/historico")
def historico():
    return render_template("historico.html", pagina="historico")


@app.route("/sobre")
def sobre():
    return render_template("sobre.html", pagina="sobre")


@app.route("/sw.js")
def service_worker():
    # O service worker fica na raiz para poder cuidar de todas as páginas.
    resposta = send_from_directory(PASTA_JS, "sw.js", mimetype="text/javascript", max_age=0)
    resposta.headers["Cache-Control"] = "no-cache"
    resposta.headers["Service-Worker-Allowed"] = "/"
    return resposta


@app.errorhandler(404)
def nao_encontrado(erro_http):
    if request.path.startswith("/api/"):
        return erro("Recurso não encontrado.", 404)

    return render_template("404.html", pagina=None), 404


# ---------------------------------------------------------------------------
# API de compromissos
# ---------------------------------------------------------------------------

@app.route("/api/appointments", methods=["POST"])
def criar_appointment():
    dados = ler_json()
    agora = agora_brasilia()

    mensagem = validar_dados_agendamento(dados, agora)

    if mensagem:
        return erro(mensagem, 400)

    novo_id = criar_agendamento(
        dados["title"].strip(),
        dados["type"].strip(),
        dados["date"],
        dados["time"],
        texto_opcional(dados, "location"),
        texto_opcional(dados, "notes"),
        dados.get("reminder_minutes", 1440),
        notificar=dados.get("notify", True),
        criado_em=agora.strftime(FORMATO_REGISTRO)
    )

    acordar_verificador()

    return jsonify({
        "message": "Agendamento criado com sucesso!",
        "id": novo_id
    }), 201


@app.route("/api/appointments", methods=["GET"])
def listar_appointments():
    agendamentos = listar_agendamentos()

    return jsonify(agendamentos)


@app.route("/api/status")
@app.route("/api/teste")
def status():
    return jsonify({
        "status": "API funcionando!",
        "versao": VERSAO,
        **hora_do_servidor()
    })


@app.route("/api/appointments/<int:id>", methods=["GET"])
def buscar_appointment(id):
    agendamento = buscar_agendamento(id)

    if agendamento is None:
        return erro("Agendamento não encontrado.", 404)

    return jsonify(agendamento)


def salvar_edicao(id, dados):
    alterado = atualizar_agendamento(
        id,
        dados["title"].strip(),
        dados["type"].strip(),
        dados["date"],
        dados["time"],
        texto_opcional(dados, "location"),
        texto_opcional(dados, "notes"),
        dados.get("reminder_minutes", 1440),
        notificar=dados.get("notify")
    )

    acordar_verificador()

    if alterado == 0:
        return erro("Agendamento não encontrado.", 404)

    return jsonify({
        "message": "Agendamento atualizado com sucesso!"
    })


@app.route("/api/appointments/<int:id>", methods=["PUT"])
def atualizar_appointment(id):
    atual = buscar_agendamento(id)

    if atual is None:
        return erro("Agendamento não encontrado.", 404)

    dados = ler_json()

    mensagem = validar_dados_agendamento(dados, agora_brasilia(), atual)

    if mensagem:
        return erro(mensagem, 400)

    return salvar_edicao(id, dados)


@app.route("/api/appointments/<int:id>", methods=["PATCH"])
def alterar_appointment(id):
    """Altera só os campos enviados. Ex.: {"notify": false} desliga a notificação."""
    atual = buscar_agendamento(id)

    if atual is None:
        return erro("Agendamento não encontrado.", 404)

    dados = ler_json()

    if not dados or not isinstance(dados, dict):
        return erro("Corpo da requisição vazio ou inválido.", 400)

    desconhecidos = sorted(set(dados) - CAMPOS_EDITAVEIS)

    if desconhecidos:
        return erro(f"Campo não pode ser alterado: {', '.join(desconhecidos)}.", 400)

    combinado = {campo: atual.get(campo) for campo in CAMPOS_EDITAVEIS}
    combinado.update(dados)

    mensagem = validar_dados_agendamento(combinado, agora_brasilia(), atual)

    if mensagem:
        return erro(mensagem, 400)

    return salvar_edicao(id, combinado)


@app.route("/api/appointments/<int:id>", methods=["DELETE"])
def excluir_appointment(id):
    excluido = excluir_agendamento(id)

    if excluido == 0:
        return erro("Agendamento não encontrado.", 404)

    return jsonify({
        "message": "Agendamento excluído com sucesso!"
    })


@app.route("/api/appointments/<int:id>/calendar.ics", methods=["GET"])
def calendario_appointment(id):
    # Arquivo para adicionar o compromisso à agenda do celular ou do computador.
    agendamento = buscar_agendamento(id)

    if agendamento is None:
        return erro("Agendamento não encontrado.", 404)

    return Response(
        gerar_ics(agendamento, datetime.now(timezone.utc)),
        mimetype="text/calendar",
        headers={
            "Content-Disposition": f'attachment; filename="{nome_do_arquivo(agendamento)}"'
        }
    )


# ---------------------------------------------------------------------------
# API de lembretes e avisos
# ---------------------------------------------------------------------------

@app.route("/api/reminders", methods=["GET"])
def listar_reminders():
    # Lembretes que entraram na janela de envio e ainda não geraram aviso.
    lembretes = listar_lembretes_pendentes(agora_brasilia())

    return jsonify(lembretes)


@app.route("/api/reminders/process", methods=["POST"])
def processar_reminders():
    # O site também verifica os lembretes, na hora exata de cada um. A
    # resposta leva a hora do servidor para o site acertar o relógio dele.
    gerados = processar_lembretes(agora_brasilia())

    return jsonify({
        "generated": gerados,
        **hora_do_servidor()
    })


@app.route("/api/notifications", methods=["GET"])
def listar_notifications():
    avisos, nao_lidos = listar_avisos()

    return jsonify({
        "notifications": avisos,
        "unread": nao_lidos
    })


@app.route("/api/notifications/<int:id>/read", methods=["POST"])
def ler_notification(id):
    encontrado = marcar_aviso_lido(id, agora_registro())

    if encontrado == 0:
        return erro("Aviso não encontrado.", 404)

    return jsonify({
        "message": "Aviso marcado como lido."
    })


@app.route("/api/notifications/read-all", methods=["POST"])
def ler_todas_notifications():
    marcados = marcar_todos_avisos_lidos(agora_registro())

    return jsonify({
        "updated": marcados
    })


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s"
    )

    modo_debug = os.environ.get("SAUDAY_DEBUG", "1") != "0"

    # Com debug, o Flask roda o site num processo filho, que reinicia ao salvar
    # um arquivo. O verificador de lembretes deve rodar só nesse processo.
    if not modo_debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        iniciar_em_segundo_plano()

    app.run(debug=modo_debug)
