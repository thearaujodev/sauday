"""Exporta um compromisso como arquivo de calendário (.ics, RFC 5545).

O arquivo abre no Google Agenda, no Calendário do iPhone, no Outlook etc.
Quando a notificação do compromisso está ligada, o evento leva um alarme
com a mesma antecedência escolhida no Sauday. Assim o celular também avisa,
mesmo com o navegador fechado.
"""

import re
import unicodedata
from datetime import datetime, timedelta

from tempo import para_utc

DURACAO_PADRAO = timedelta(hours=1)
NOMES_CATEGORIAS = {
    "consulta": "Consulta",
    "exame": "Exame",
    "vacina": "Vacina",
    "outro": "Outro",
}


def _escapar(texto):
    """Escapa um texto para propriedades do iCalendar (seção 3.3.11)."""
    return (
        texto.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
    )


def _dobrar(linha):
    """Quebra linhas com mais de 75 bytes, sem partir caracteres (seção 3.1)."""
    partes = []
    atual = b""

    for caractere in linha:
        codificado = caractere.encode("utf-8")

        if len(atual) + len(codificado) > 75:
            partes.append(atual.decode("utf-8"))
            atual = b" " + codificado
        else:
            atual += codificado

    partes.append(atual.decode("utf-8"))

    return "\r\n".join(partes)


def _utc(momento):
    return momento.strftime("%Y%m%dT%H%M%SZ")


def nome_do_arquivo(agendamento):
    """Nome de arquivo só com letras simples, ex.: sauday-consulta-cardiologista.ics"""
    sem_acentos = (
        unicodedata.normalize("NFKD", agendamento["title"])
        .encode("ascii", "ignore")
        .decode("ascii")
    )
    trecho = re.sub(r"[^a-z0-9]+", "-", sem_acentos.lower()).strip("-")[:40].strip("-")

    return f"sauday-{trecho or 'compromisso'}.ics"


def gerar_ics(agendamento, gerado_em_utc):
    inicio = datetime.strptime(
        f"{agendamento['date']} {agendamento['time']}", "%Y-%m-%d %H:%M"
    )
    inicio_utc = para_utc(inicio)
    categoria = NOMES_CATEGORIAS.get(agendamento["type"], agendamento["type"])

    descricao = [f"Categoria: {categoria}"]
    if agendamento.get("notes"):
        descricao.append(f"Observações: {agendamento['notes']}")
    descricao.append("Criado no Sauday: sua saúde, no seu dia.")

    linhas = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Sauday//Agenda de saude//PT-BR",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:sauday-{agendamento['id']}@sauday.local",
        f"DTSTAMP:{_utc(gerado_em_utc)}",
        f"DTSTART:{_utc(inicio_utc)}",
        f"DTEND:{_utc(inicio_utc + DURACAO_PADRAO)}",
        f"SUMMARY:{_escapar(agendamento['title'])}",
        f"CATEGORIES:{_escapar(categoria)}",
        f"DESCRIPTION:{_escapar(chr(10).join(descricao))}",
    ]

    if agendamento.get("location"):
        linhas.append(f"LOCATION:{_escapar(agendamento['location'])}")

    if agendamento.get("notify", True):
        minutos = agendamento["reminder_minutes"]
        gatilho = f"-PT{minutos}M" if minutos else "PT0M"
        linhas += [
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{_escapar('Lembrete: ' + agendamento['title'])}",
            f"TRIGGER:{gatilho}",
            "END:VALARM",
        ]

    linhas += ["END:VEVENT", "END:VCALENDAR"]

    return "\r\n".join(_dobrar(linha) for linha in linhas) + "\r\n"
