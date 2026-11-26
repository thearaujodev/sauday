import argparse
import logging
import threading
import time
from datetime import datetime, timedelta

from database import (
    criar_tabela,
    listar_agendamentos,
    registrar_lembrete
)
from tempo import FORMATO_REGISTRO, agora_brasilia, configurar_log

logger = logging.getLogger("healthreminder.reminders")

INTERVALO_PADRAO_SEGUNDOS = 30

# Tempo mínimo que a janela de envio fica aberta. Sem isso, um lembrete com
# antecedência zero ("na hora") teria janela vazia e nunca seria enviado.
JANELA_MINIMA = timedelta(minutes=1)

# FORMATO_REGISTRO continua disponível aqui para quem já o importava deste módulo.
__all__ = [
    "FORMATO_REGISTRO",
    "calcular_momento_lembrete",
    "verificar_lembretes",
    "listar_lembretes_pendentes",
    "segundos_ate_proximo_lembrete",
    "processar_lembretes",
    "acordar_verificador",
    "iniciar_em_segundo_plano",
    "executar_servico",
]


# ---------------------------------------------------------------------------
# Lógica de decisão: quais lembretes estão na janela de envio
# ---------------------------------------------------------------------------

def calcular_momento_lembrete(data, horario, minutos):
    data_hora_agendamento = _data_hora(data, horario)

    momento_lembrete = data_hora_agendamento - timedelta(minutes=minutos)

    return momento_lembrete


def _data_hora(data, horario):
    return datetime.strptime(f"{data} {horario}", "%Y-%m-%d %H:%M")


def _janela(agendamento):
    """Início e fim da janela de envio, ou None se o compromisso não deve avisar."""
    if agendamento.get("reminded_at") is not None:
        return None

    # Compromisso com a notificação desligada pela pessoa: nenhum aviso.
    if not agendamento.get("notify", True):
        return None

    try:
        data_hora_agendamento = _data_hora(agendamento["date"], agendamento["time"])
        momento_lembrete = data_hora_agendamento - timedelta(
            minutes=agendamento["reminder_minutes"]
        )
    except (ValueError, KeyError, TypeError, OverflowError):
        # Dados inválidos não podem derrubar a verificação dos demais.
        return None

    fim = max(data_hora_agendamento, momento_lembrete + JANELA_MINIMA)

    return momento_lembrete, fim


def verificar_lembretes(agendamentos, agora=None):
    if agora is None:
        agora = agora_brasilia()

    lembretes = []

    for agendamento in agendamentos:
        janela = _janela(agendamento)

        if janela is None:
            continue

        momento_lembrete, fim = janela

        if momento_lembrete <= agora < fim:
            agendamento_com_lembrete = agendamento.copy()

            agendamento_com_lembrete["reminder_at"] = (
                momento_lembrete.strftime("%Y-%m-%d %H:%M")
            )

            lembretes.append(agendamento_com_lembrete)

    return lembretes


def listar_lembretes_pendentes(agora=None):
    agendamentos = listar_agendamentos()

    return verificar_lembretes(agendamentos, agora)


def segundos_ate_proximo_lembrete(agendamentos, agora=None):
    """Quanto falta (em segundos) para o próximo lembrete futuro, ou None."""
    if agora is None:
        agora = agora_brasilia()

    menor = None

    for agendamento in agendamentos:
        janela = _janela(agendamento)

        if janela is None or janela[0] <= agora:
            continue

        falta = (janela[0] - agora).total_seconds()
        menor = falta if menor is None else min(menor, falta)

    return menor


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

    Pode ser chamado pelo verificador em segundo plano, pelo serviço avulso e
    pelo site ao mesmo tempo: registrar_lembrete() garante que cada lembrete
    gere um único aviso. Retorna quantos avisos foram gerados neste ciclo.
    """
    if agora is None:
        agora = agora_brasilia()

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


def _ciclo(intervalo):
    """Processa os lembretes e devolve quantos segundos esperar até o próximo ciclo.

    Em vez de esperar sempre o intervalo inteiro, acorda na hora exata do
    próximo lembrete, para o aviso ser registrado no momento certo.
    """
    try:
        processar_lembretes()
        falta = segundos_ate_proximo_lembrete(listar_agendamentos())
    except Exception:
        # Um erro em um ciclo (ex.: banco travado) não derruba o serviço.
        logger.exception(
            "Erro ao processar lembretes. Nova tentativa no próximo ciclo."
        )
        return intervalo

    if falta is None:
        return intervalo

    return max(0.5, min(intervalo, falta + 0.2))


_acordar = threading.Event()


def acordar_verificador():
    """Pede ao verificador em segundo plano que confira os lembretes agora.

    Chamado depois de criar ou editar um compromisso, para que a espera
    seja recalculada com os dados novos.
    """
    _acordar.set()


def iniciar_em_segundo_plano(intervalo=INTERVALO_PADRAO_SEGUNDOS):
    """Roda a verificação dentro do próprio servidor do site, numa thread.

    Assim os avisos são gerados na hora certa sem precisar abrir um segundo
    terminal com o serviço de lembretes.
    """
    def laco():
        while True:
            _acordar.clear()
            espera = _ciclo(intervalo)
            _acordar.wait(espera)

    thread = threading.Thread(target=laco, name="sauday-lembretes", daemon=True)
    thread.start()

    logger.info("Verificador de lembretes ativo (horário de Brasília).")

    return thread


def executar_servico(intervalo=INTERVALO_PADRAO_SEGUNDOS):
    logger.info(
        "Serviço de lembretes iniciado (verificação a cada %s s, ou antes, "
        "na hora de cada lembrete). Ctrl+C para parar.",
        intervalo
    )

    try:
        while True:
            time.sleep(_ciclo(intervalo))

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
        help="segundos máximos entre verificações (padrão: %(default)s)"
    )
    argumentos = parser.parse_args()

    configurar_log()

    criar_tabela()
    executar_servico(argumentos.intervalo)
