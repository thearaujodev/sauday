import sqlite3

CAMINHO_BANCO = "database/healthreminder.db"


def conectar():
    connection = sqlite3.connect(CAMINHO_BANCO, timeout=10)
    # Necessário em cada conexão para o SQLite respeitar o ON DELETE CASCADE.
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def criar_tabela():
    connection = conectar()
    cursor = connection.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            location TEXT,
            notes TEXT,
            reminder_minutes INTEGER NOT NULL DEFAULT 1440,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            reminded_at TEXT
        )
    """)

    cursor.execute("PRAGMA table_info(appointments)")

    colunas = [coluna[1] for coluna in cursor.fetchall()]

    if "reminded_at" not in colunas:
        cursor.execute("""
            ALTER TABLE appointments
            ADD COLUMN reminded_at TEXT
        """)

    # Avisos: registro de cada lembrete gerado. Guarda uma cópia dos dados do
    # compromisso no momento do aviso, para o histórico continuar correto mesmo
    # que o compromisso seja editado depois. Se o compromisso for excluído,
    # os avisos dele são excluídos junto.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            appointment_id INTEGER NOT NULL
                REFERENCES appointments(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            location TEXT,
            reminder_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            read_at TEXT
        )
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_notifications_appointment
        ON notifications (appointment_id)
    """)

    connection.commit()
    connection.close()


def criar_agendamento(titulo, tipo, data, horario, local, observacoes, lembrete):
    connection = conectar()
    cursor = connection.cursor()

    cursor.execute("""
        INSERT INTO appointments (
            title,
            type,
            date,
            time,
            location,
            notes,
            reminder_minutes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        titulo,
        tipo,
        data,
        horario,
        local,
        observacoes,
        lembrete
    ))

    connection.commit()

    novo_id = cursor.lastrowid

    connection.close()

    return novo_id


def listar_agendamentos():
    connection = conectar()
    connection.row_factory = sqlite3.Row
    cursor = connection.cursor()

    cursor.execute("SELECT * FROM appointments ORDER BY date, time, id")

    agendamentos = [dict(row) for row in cursor.fetchall()]

    connection.close()

    return agendamentos


def buscar_agendamento(id):
    connection = conectar()
    connection.row_factory = sqlite3.Row
    cursor = connection.cursor()

    cursor.execute(
        "SELECT * FROM appointments WHERE id = ?",
        (id,)
    )

    agendamento = cursor.fetchone()

    connection.close()

    if agendamento:
        return dict(agendamento)

    return None


def atualizar_agendamento(id, titulo, tipo, data, horario, local, observacoes, lembrete):
    connection = conectar()
    cursor = connection.cursor()

    # Se a data, o horário ou a antecedência mudarem, o lembrete é "rearmado"
    # (reminded_at volta a NULL). Editar só título, local ou observações
    # não dispara um novo lembrete. No SQLite, as colunas à direita do SET
    # sempre se referem aos valores antigos da linha.
    cursor.execute("""
        UPDATE appointments
        SET
            title = ?,
            type = ?,
            date = ?,
            time = ?,
            location = ?,
            notes = ?,
            reminder_minutes = ?,
            reminded_at = CASE
                WHEN date <> ? OR time <> ? OR reminder_minutes <> ?
                THEN NULL
                ELSE reminded_at
            END
        WHERE id = ?
    """, (
        titulo,
        tipo,
        data,
        horario,
        local,
        observacoes,
        lembrete,
        data,
        horario,
        lembrete,
        id
    ))

    connection.commit()

    alterado = cursor.rowcount

    connection.close()

    return alterado


def excluir_agendamento(id):
    connection = conectar()
    cursor = connection.cursor()

    cursor.execute(
        "DELETE FROM appointments WHERE id = ?",
        (id,)
    )

    connection.commit()

    excluido = cursor.rowcount

    connection.close()

    return excluido


# ---------------------------------------------------------------------------
# Lembretes e avisos
# ---------------------------------------------------------------------------

def registrar_lembrete(agendamento, reminder_at, gerado_em):
    """Marca o compromisso como lembrado e grava o aviso, numa única transação.

    O UPDATE só altera a linha se reminded_at ainda for NULL. Assim, mesmo
    que o serviço de lembretes e o site processem ao mesmo tempo, apenas um
    consegue registrar o aviso. Retorna o id do aviso criado, ou None se o
    lembrete já tinha sido registrado por outro processo.
    """
    connection = conectar()
    cursor = connection.cursor()

    try:
        cursor.execute("""
            UPDATE appointments
            SET reminded_at = ?
            WHERE id = ?
            AND reminded_at IS NULL
        """, (gerado_em, agendamento["id"]))

        if cursor.rowcount == 0:
            connection.rollback()
            return None

        cursor.execute("""
            INSERT INTO notifications (
                appointment_id, title, type, date, time,
                location, reminder_at, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            agendamento["id"],
            agendamento["title"],
            agendamento["type"],
            agendamento["date"],
            agendamento["time"],
            agendamento.get("location"),
            reminder_at,
            gerado_em
        ))

        connection.commit()

        return cursor.lastrowid

    except Exception:
        connection.rollback()
        raise

    finally:
        connection.close()


def listar_avisos(limite=50):
    connection = conectar()
    connection.row_factory = sqlite3.Row
    cursor = connection.cursor()

    cursor.execute("""
        SELECT * FROM notifications
        ORDER BY created_at DESC, id DESC
        LIMIT ?
    """, (limite,))

    avisos = [dict(row) for row in cursor.fetchall()]

    cursor.execute("SELECT COUNT(*) FROM notifications WHERE read_at IS NULL")
    nao_lidos = cursor.fetchone()[0]

    connection.close()

    return avisos, nao_lidos


def marcar_aviso_lido(id, lido_em):
    """Retorna 1 se o aviso existe (lido agora ou antes) e 0 se não existe."""
    connection = conectar()
    cursor = connection.cursor()

    cursor.execute("""
        UPDATE notifications
        SET read_at = COALESCE(read_at, ?)
        WHERE id = ?
    """, (lido_em, id))

    connection.commit()

    encontrado = cursor.rowcount

    connection.close()

    return encontrado


def marcar_todos_avisos_lidos(lido_em):
    connection = conectar()
    cursor = connection.cursor()

    cursor.execute("""
        UPDATE notifications
        SET read_at = ?
        WHERE read_at IS NULL
    """, (lido_em,))

    connection.commit()

    marcados = cursor.rowcount

    connection.close()

    return marcados
