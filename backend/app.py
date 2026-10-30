from datetime import datetime

from flask import Flask, request, jsonify, render_template

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
    FORMATO_REGISTRO,
    listar_lembretes_pendentes,
    processar_lembretes
)

NOME_PRODUTO = "Sauday"
VERSAO = "Alpha 0.1"
SLOGAN = "sua saúde, no seu dia"

LIMITES_TEXTO = {"title": 120, "type": 30, "location": 120, "notes": 500}

# static/ fica na raiz do projeto, um nível acima de backend/
app = Flask(__name__, static_folder="../static", static_url_path="/static")

criar_tabela()


@app.context_processor
def dados_do_produto():
    # Fonte única para nome, versão e slogan em todas as páginas.
    return {"produto": NOME_PRODUTO, "versao": VERSAO, "slogan": SLOGAN}


def validar_dados_agendamento(dados):
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
        datetime.strptime(dados["date"], "%Y-%m-%d")
    except ValueError:
        return "Data inválida. Use o formato AAAA-MM-DD."

    try:
        datetime.strptime(dados["time"], "%H:%M")
    except ValueError:
        return "Horário inválido. Use o formato HH:MM."

    reminder = dados.get("reminder_minutes", 1440)

    if isinstance(reminder, bool) or not isinstance(reminder, int) or reminder < 0:
        return "reminder_minutes deve ser um número inteiro maior ou igual a zero."

    return None


def texto_opcional(dados, campo):
    valor = dados.get(campo)

    if isinstance(valor, str):
        valor = valor.strip()

    return valor or None


def ler_json():
    return request.get_json(silent=True)


def agora_registro():
    return datetime.now().strftime(FORMATO_REGISTRO)


# ---------------------------------------------------------------------------
# Páginas
# ---------------------------------------------------------------------------

@app.route("/")
def home():
    return render_template("index.html", pagina="inicio")


@app.route("/sobre")
def sobre():
    return render_template("sobre.html", pagina="sobre")


@app.errorhandler(404)
def nao_encontrado(erro):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Recurso não encontrado."}), 404

    return render_template("404.html", pagina=None), 404


# ---------------------------------------------------------------------------
# API de compromissos
# ---------------------------------------------------------------------------

@app.route("/api/appointments", methods=["POST"])
def criar_appointment():
    dados = ler_json()

    erro = validar_dados_agendamento(dados)

    if erro:
        return jsonify({
            "error": erro
        }), 400

    novo_id = criar_agendamento(
        dados["title"].strip(),
        dados["type"].strip(),
        dados["date"],
        dados["time"],
        texto_opcional(dados, "location"),
        texto_opcional(dados, "notes"),
        dados.get("reminder_minutes", 1440)
    )

    return jsonify({
        "message": "Agendamento criado com sucesso!",
        "id": novo_id
    }), 201


@app.route("/api/appointments", methods=["GET"])
def listar_appointments():
    agendamentos = listar_agendamentos()

    return jsonify(agendamentos)


@app.route("/api/teste")
def teste():
    return jsonify({
        "status": "API funcionando!",
        "versao": VERSAO
    })


@app.route("/api/appointments/<int:id>", methods=["GET"])
def buscar_appointment(id):
    agendamento = buscar_agendamento(id)

    if agendamento is None:
        return jsonify({
            "error": "Agendamento não encontrado."
        }), 404

    return jsonify(agendamento)


@app.route("/api/appointments/<int:id>", methods=["PUT"])
def atualizar_appointment(id):
    dados = ler_json()

    erro = validar_dados_agendamento(dados)

    if erro:
        return jsonify({
            "error": erro
        }), 400

    alterado = atualizar_agendamento(
        id,
        dados["title"].strip(),
        dados["type"].strip(),
        dados["date"],
        dados["time"],
        texto_opcional(dados, "location"),
        texto_opcional(dados, "notes"),
        dados.get("reminder_minutes", 1440)
    )

    if alterado == 0:
        return jsonify({
            "error": "Agendamento não encontrado."
        }), 404

    return jsonify({
        "message": "Agendamento atualizado com sucesso!"
    })


@app.route("/api/appointments/<int:id>", methods=["DELETE"])
def excluir_appointment(id):
    excluido = excluir_agendamento(id)

    if excluido == 0:
        return jsonify({
            "error": "Agendamento não encontrado."
        }), 404

    return jsonify({
        "message": "Agendamento excluído com sucesso!"
    })


# ---------------------------------------------------------------------------
# API de lembretes e avisos
# ---------------------------------------------------------------------------

@app.route("/api/reminders", methods=["GET"])
def listar_reminders():
    # Lembretes que entraram na janela de envio e ainda não geraram aviso.
    lembretes = listar_lembretes_pendentes()

    return jsonify(lembretes)


@app.route("/api/reminders/process", methods=["POST"])
def processar_reminders():
    # O site também verifica os lembretes, então os avisos aparecem mesmo
    # quando o serviço em segundo plano (reminders.py) não está rodando.
    gerados = processar_lembretes()

    return jsonify({
        "generated": gerados
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
        return jsonify({
            "error": "Aviso não encontrado."
        }), 404

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
    app.run(debug=True)
