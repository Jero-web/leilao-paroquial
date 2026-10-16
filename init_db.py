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
