import argparse
import logging
import time
from datetime import datetime, timedelta

from database import (
    criar_tabela,
    listar_agendamentos,
    registrar_lembrete
)

logger = logging.getLogger("healthreminder.reminders")

INTERVALO_PADRAO_SEGUNDOS = 30
FORMATO_REGISTRO = "%Y-%m-%d %H:%M:%S"


# ---------------------------------------------------------------------------
# Lógica de decisão: quais lembretes estão na janela de envio
# ---------------------------------------------------------------------------

def calcular_momento_lembrete(data, horario, minutos):
    data_hora_agendamento = datetime.strptime(
        f"{data} {horario}",
        "%Y-%m-%d %H:%M"
    )

    momento_lembrete = data_hora_agendamento - timedelta(minutes=minutos)

    return momento_lembrete


def verificar_lembretes(agendamentos, agora=None):
    if agora is None:
        agora = datetime.now()

    lembretes = []

    for agendamento in agendamentos:
        if agendamento.get("reminded_at") is not None:
            continue

        try:
            data_hora_agendamento = datetime.strptime(
                f"{agendamento['date']} {agendamento['time']}",
                "%Y-%m-%d %H:%M"
            )

            momento_lembrete = data_hora_agendamento - timedelta(
                minutes=agendamento["reminder_minutes"]
            )

            if momento_lembrete <= agora < data_hora_agendamento:
                agendamento_com_lembrete = agendamento.copy()

                agendamento_com_lembrete["reminder_at"] = (
                    momento_lembrete.strftime("%Y-%m-%d %H:%M")
                )

                lembretes.append(agendamento_com_lembrete)

        except (ValueError, KeyError, TypeError):
            continue

    return lembretes


def listar_lembretes_pendentes(agora=None):
    agendamentos = listar_agendamentos()

    return verificar_lembretes(agendamentos, agora)


# ---------------------------------------------------------------------------
# Envio: o aviso fica registrado no banco (central de avisos do site) e
# também é escrito no log. E-mail, push etc. entram depois trocando apenas
# a função notificar().
# ---------------------------------------------------------------------------

def notificar(agendamento):
    local = agendamento.get("location") or "local não informado"

    logger.info(
        "LEMBRETE | %s (%s) | %s às %s | %s | id=%s",
        agendamento["title"],
        agendamento["type"],
        agendamento["date"],
        agendamento["time"],
        local,
        agendamento["id"]
    )


# ---------------------------------------------------------------------------
# Serviço: um ciclo de verificação e o loop contínuo
# ---------------------------------------------------------------------------

def processar_lembretes(agora=None, notificador=None):
    """Executa um ciclo: encontra lembretes pendentes, registra o aviso e notifica.

    Pode ser chamado pelo serviço em segundo plano e pelo site ao mesmo tempo:
    registrar_lembrete() garante que cada lembrete gere um único aviso.
    Retorna quantos avisos foram gerados neste ciclo.
    """
    if agora is None:
        agora = datetime.now()

    if notificador is None:
        notificador = notificar

    gerado_em = agora.strftime(FORMATO_REGISTRO)
    gerados = 0

    for lembrete in listar_lembretes_pendentes(agora):
        aviso_id = registrar_lembrete(lembrete, lembrete["reminder_at"], gerado_em)

        if aviso_id is None:
            continue

        # O aviso já está gravado. Se o canal extra (log, e-mail...) falhar,
        # ele continua visível na central de avisos.
        gerados += 1

        try:
            notificador(lembrete)
        except Exception:
            logger.exception(
                "Falha ao notificar o agendamento id=%s.",
                lembrete["id"]
            )

    return gerados


def executar_servico(intervalo=INTERVALO_PADRAO_SEGUNDOS):
    logger.info(
        "Serviço de lembretes iniciado (verificação a cada %s s). "
        "Ctrl+C para parar.",
        intervalo
    )

    try:
        while True:
            try:
                processar_lembretes()
            except Exception:
                # Um erro em um ciclo (ex.: banco travado) não derruba o serviço.
                logger.exception(
                    "Erro ao processar lembretes. Nova tentativa no próximo ciclo."
                )

            time.sleep(intervalo)

    except KeyboardInterrupt:
        logger.info("Serviço de lembretes encerrado.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Serviço automático de lembretes do Sauday."
    )
    parser.add_argument(
        "--intervalo",
        type=int,
        default=INTERVALO_PADRAO_SEGUNDOS,
        help="segundos entre verificações (padrão: %(default)s)"
    )
    argumentos = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s"
    )

    criar_tabela()
    executar_servico(argumentos.intervalo)
