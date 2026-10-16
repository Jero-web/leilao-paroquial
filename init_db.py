"""Cria o banco SQLite (tabelas e índices). Pode rodar quantas vezes quiser."""
import os
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("LEILAO_DB", BASE_DIR / "leilao.db"))


def migrar(conn):
    """Atualiza bancos criados por versões anteriores."""
    colunas = [r[1] for r in conn.execute("PRAGMA table_info(arremates)")]
    if colunas and "doado" not in colunas:
        conn.execute("ALTER TABLE arremates ADD COLUMN doado INTEGER NOT NULL DEFAULT 0")
    colunas = [r[1] for r in conn.execute("PRAGMA table_info(itens)")]
    if colunas and "tipo_id" not in colunas:
        conn.execute("ALTER TABLE itens ADD COLUMN tipo_id INTEGER REFERENCES tipos_item (id)")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS pagamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            arrematante_id INTEGER NOT NULL REFERENCES pessoas (id),
            valor_total_devedor REAL NOT NULL,
            valor_pix REAL NOT NULL DEFAULT 0.00,
            valor_especie REAL NOT NULL DEFAULT 0.00,
            valor_pago_total REAL NOT NULL,
            saldo_restante REAL NOT NULL,
            observacao_pendencia TEXT,
            status TEXT NOT NULL CHECK (status IN ('LIQUIDADO', 'PENDENTE')),
            data_pagamento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    conn.execute(
        """CREATE INDEX IF NOT EXISTS idx_pagamentos_arrematante
           ON pagamentos (arrematante_id, data_pagamento DESC, id DESC)"""
    )
    conn.commit()


def init_db(db_path=DB_PATH):
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("PRAGMA journal_mode = WAL")  # leituras e escritas simultâneas em vários computadores
        migrar(conn)
        conn.executescript((BASE_DIR / "schema.sql").read_text(encoding="utf-8"))
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    init_db()
    print(f"Banco pronto em: {DB_PATH}")
