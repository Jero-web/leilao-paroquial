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

-- Tipos de item (Bolo, Prenda, Bebida...). O nome é único sem diferenciar maiúsculas/minúsculas.
CREATE TABLE IF NOT EXISTS tipos_item (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    nome  TEXT NOT NULL UNIQUE COLLATE NOCASE
);

-- Número de Ordem = itens.id
CREATE TABLE IF NOT EXISTS itens (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    produto       TEXT NOT NULL,
    valor_minimo  REAL NOT NULL DEFAULT 0,
    descricao     TEXT,
    doador_id     INTEGER REFERENCES pessoas (id),
    tipo_id       INTEGER REFERENCES tipos_item (id)
);
CREATE INDEX IF NOT EXISTS idx_itens_doador ON itens (doador_id);
CREATE INDEX IF NOT EXISTS idx_itens_tipo ON itens (tipo_id);

CREATE TABLE IF NOT EXISTS arremates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id         INTEGER NOT NULL REFERENCES itens (id),
    arrematante_id  INTEGER NOT NULL REFERENCES pessoas (id),
    valor_arremate  REAL NOT NULL CHECK (valor_arremate > 0),
    data_hora       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    doado           INTEGER NOT NULL DEFAULT 0 CHECK (doado IN (0, 1))
);

CREATE TABLE IF NOT EXISTS pagamentos (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    arrematante_id      INTEGER NOT NULL REFERENCES pessoas (id),
    valor_total_devedor REAL NOT NULL,
    valor_pix           REAL NOT NULL DEFAULT 0.00,
    valor_especie       REAL NOT NULL DEFAULT 0.00,
    valor_pago_total    REAL NOT NULL,
    saldo_restante      REAL NOT NULL,
    observacao_pendencia TEXT,
    status              TEXT NOT NULL CHECK (status IN ('LIQUIDADO', 'PENDENTE')),
    data_pagamento      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pagamentos_arrematante
    ON pagamentos (arrematante_id, data_pagamento DESC, id DESC);

-- Cada linha é um lance. Dentro de uma "rodada" o valor só cresce, então o último lance do item é o maior.
-- doado = 1: o arrematante doou o item de volta. A venda continua valendo (e fica na promissória dele,
-- marcada com D), a rodada se encerra e o item volta ao leilão a partir do valor mínimo.
-- (Migrações: o índice único por item e o por item+valor de versões anteriores saem; valores podem se repetir
-- entre rodadas. A escrita é serializada pelo servidor com BEGIN IMMEDIATE.)
DROP INDEX IF EXISTS ux_arremates_item;
DROP INDEX IF EXISTS ux_arremates_item_valor;
CREATE INDEX IF NOT EXISTS idx_arremates_item ON arremates (item_id, id);
CREATE INDEX IF NOT EXISTS idx_arremates_arrematante ON arremates (arrematante_id);
CREATE INDEX IF NOT EXISTS idx_arremates_data ON arremates (data_hora DESC);

-- Maior lance atual de cada item: o último lance, se ele não foi doado (item doado fica sem lance atual).
DROP VIEW IF EXISTS lider_atual;
CREATE VIEW lider_atual AS
SELECT a.id, a.item_id, a.arrematante_id, a.valor_arremate, a.data_hora
  FROM arremates a
 WHERE a.doado = 0
   AND a.id = (SELECT MAX(b.id) FROM arremates b WHERE b.item_id = a.item_id);

-- Vendas que contam para promissórias e totais: o lance vencedor de cada rodada
-- (um lance doado, ou o último lance do item). Lances superados ficam de fora.
DROP VIEW IF EXISTS arremates_vencedores;
CREATE VIEW arremates_vencedores AS
SELECT a.id, a.item_id, a.arrematante_id, a.valor_arremate, a.data_hora, a.doado
  FROM arremates a
 WHERE a.doado = 1
    OR a.id = (SELECT MAX(b.id) FROM arremates b WHERE b.item_id = a.item_id);
