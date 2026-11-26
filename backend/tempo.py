"""Hora oficial do Sauday: o horário de Brasília.

Os compromissos são guardados como data e hora "de parede" de Brasília
(ex.: 2026-11-26 e 10:00), sem fuso. Por isso toda comparação com o
momento atual usa agora_brasilia(), e não datetime.now(), que depende do
fuso configurado no computador onde o servidor roda. Assim o Sauday se
comporta igual em um notebook em São Paulo ou em um servidor em UTC.
"""

from datetime import datetime, timedelta, timezone

NOME_FUSO = "America/Sao_Paulo"
FORMATO_REGISTRO = "%Y-%m-%d %H:%M:%S"

try:
    from zoneinfo import ZoneInfo

    FUSO_BRASILIA = ZoneInfo(NOME_FUSO)
except Exception:  # base de fusos ausente (ex.: Windows sem o pacote tzdata)
    # O Brasil não adota horário de verão desde 2019, então UTC-3 fixo
    # dá o mesmo resultado para as datas atuais.
    FUSO_BRASILIA = timezone(timedelta(hours=-3), "BRT")


def agora_brasilia():
    """Data e hora atuais em Brasília, sem fuso (o mesmo formato do banco)."""
    return datetime.now(FUSO_BRASILIA).replace(tzinfo=None)


def para_utc(momento):
    """Converte uma data e hora de Brasília (sem fuso) para UTC."""
    return momento.replace(tzinfo=FUSO_BRASILIA).astimezone(timezone.utc)
