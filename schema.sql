PRAGMA foreign_keys = ON;

-- Número de Cadastro = pessoas.id
CREATE TABLE IF NOT EXISTS pessoas (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nome      TEXT NOT NULL,
    cpf       TEXT,
    telefone  TEXT,
    endereco  TEXT,
    funcao    TEXT NOT NULL DEFAULT 'CLIENTE' CHECK (funcao IN ('CLIENTE', 'COMISSAO'))
);
CREATE INDEX IF NOT EXISTS idx_pessoas_nome ON pessoas (nome COLLATE NOCASE);

-- Número de Ordem = itens.id
CREATE TABLE IF NOT EXISTS itens (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    produto       TEXT NOT NULL,
    valor_minimo  REAL NOT NULL DEFAULT 0,
    descricao     TEXT,
    doador_id     INTEGER REFERENCES pessoas (id)
);
CREATE INDEX IF NOT EXISTS idx_itens_doador ON itens (doador_id);

CREATE TABLE IF NOT EXISTS arremates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id         INTEGER NOT NULL REFERENCES itens (id),
    arrematante_id  INTEGER NOT NULL REFERENCES pessoas (id),
    valor_arremate  REAL NOT NULL CHECK (valor_arremate > 0),
    data_hora       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Um item só pode ser arrematado uma vez (cancele o arremate para relançar).
CREATE UNIQUE INDEX IF NOT EXISTS ux_arremates_item ON arremates (item_id);
CREATE INDEX IF NOT EXISTS idx_arremates_arrematante ON arremates (arrematante_id);
CREATE INDEX IF NOT EXISTS idx_arremates_data ON arremates (data_hora DESC);
