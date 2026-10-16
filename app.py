"""Leilão Paroquial: operação rápida pelo teclado (Flask + SQLite + ReportLab)."""
import io
import math
import os
import re
import sqlite3
import unicodedata
from datetime import datetime
from xml.sax.saxutils import escape as xml_escape

from flask import Flask, g, jsonify, redirect, render_template, request, send_file, url_for
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from init_db import DB_PATH, init_db

LEILAO_NOME = os.environ.get("LEILAO_NOME", "Leilão Paroquial")

app = Flask(__name__)
app.json.ensure_ascii = False
init_db()


# --------------------------------------------------------------------------- utilidades
def get_db():
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.create_function("norm", 1, normalizar, deterministic=True)
        g.db = conn
    return g.db


@app.teardown_appcontext
def fechar_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


@app.context_processor
def contexto():
    return {"nome_leilao": LEILAO_NOME}


def normalizar(texto):
    """Minúsculas e sem acento, para buscar 'jose' e achar 'José'."""
    if texto is None:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(texto))
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def parse_valor(raw):
    """Aceita '80', '80,5', '1.234,50', '1234.50', '1.500' (=1500) e 'R$ 80'."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        v = float(raw)
    else:
        s = re.sub(r"[^\d,.\-]", "", str(raw))
        if not s:
            return None
        if "," in s:
            s = s.replace(".", "").replace(",", ".")
        elif re.fullmatch(r"\d{1,3}(\.\d{3})+", s):
            s = s.replace(".", "")
        try:
            v = float(s)
        except ValueError:
            return None
    return round(v, 2) if math.isfinite(v) else None


def brl(valor):
    s = f"{(valor or 0):,.2f}"
    return "R$ " + s.replace(",", "X").replace(".", ",").replace("X", ".")


def to_int(raw):
    s = str(raw if raw is not None else "").strip()
    return int(s) if s.isascii() and s.isdigit() else None


def txt(dados, chave):
    v = str(dados.get(chave) or "").strip()
    return v or None


def erro(mensagem, status=400, **extra):
    return jsonify({"erro": mensagem, **extra}), status


# --------------------------------------------------------------------------- páginas
@app.get("/")
def index():
    return redirect(url_for("arrematacao"))


@app.get("/pessoas")
def pessoas():
    return render_template("pessoas.html")


@app.get("/pessoas/lista")
def pessoas_lista():
    return render_template("pessoas_lista.html")


@app.get("/itens")
def itens():
    proximo = get_db().execute("SELECT COALESCE(MAX(id), 0) + 1 AS p FROM itens").fetchone()["p"]
    return render_template("itens.html", proximo=proximo)


@app.get("/arrematacao")
def arrematacao():
    return render_template("arrematacao.html")


# --------------------------------------------------------------------------- API: pessoas
def validar_pessoa(d):
    """Valida os campos de uma pessoa. Devolve (dados, None) ou (None, resposta_de_erro)."""
    nome = txt(d, "nome")
    if not nome:
        return None, erro("Informe o nome.", 422, campo="nome")
    funcao = (txt(d, "funcao") or "CLIENTE").upper()
    if funcao not in ("CLIENTE", "COMISSAO"):
        return None, erro("Função inválida.", 422, campo="funcao")
    return {"nome": nome, "cpf": txt(d, "cpf"), "telefone": txt(d, "telefone"),
            "endereco": txt(d, "endereco"), "funcao": funcao}, None


@app.post("/api/pessoas")
def api_criar_pessoa():
    dados, resposta = validar_pessoa(request.get_json(silent=True) or {})
    if resposta:
        return resposta
    db = get_db()
    cur = db.execute(
        "INSERT INTO pessoas (nome, cpf, telefone, endereco, funcao) VALUES (?, ?, ?, ?, ?)",
        (dados["nome"], dados["cpf"], dados["telefone"], dados["endereco"], dados["funcao"]),
    )
    db.commit()
    row = db.execute("SELECT * FROM pessoas WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


@app.put("/api/pessoas/<int:pid>")
def api_editar_pessoa(pid):
    """Altera os dados da pessoa. O número de cadastro não muda (promissórias e lances dependem dele)."""
    db = get_db()
    if db.execute("SELECT 1 FROM pessoas WHERE id = ?", (pid,)).fetchone() is None:
        return erro(f"Cadastro nº {pid} não encontrado.", 404)
    dados, resposta = validar_pessoa(request.get_json(silent=True) or {})
    if resposta:
        return resposta
    db.execute(
        "UPDATE pessoas SET nome = ?, cpf = ?, telefone = ?, endereco = ?, funcao = ? WHERE id = ?",
        (dados["nome"], dados["cpf"], dados["telefone"], dados["endereco"], dados["funcao"], pid),
    )
    db.commit()
    return jsonify(dict(db.execute("SELECT * FROM pessoas WHERE id = ?", (pid,)).fetchone()))


@app.delete("/api/pessoas/<int:pid>")
def api_excluir_pessoa(pid):
    """Exclui o cadastro. Quem tem lances só é excluído com forcar=1, o que apaga também os lances dele.
    Itens doados por essa pessoa continuam cadastrados, só ficam sem doador."""
    forcar = request.args.get("forcar") == "1"
    db = get_db()
    pessoa = db.execute("SELECT id, nome FROM pessoas WHERE id = ?", (pid,)).fetchone()
    if pessoa is None:
        return erro(f"Cadastro nº {pid} não encontrado.", 404)
    lances = db.execute("SELECT COUNT(*) AS n FROM arremates WHERE arrematante_id = ?", (pid,)).fetchone()["n"]
    if lances and not forcar:
        vendas = [dict(r) for r in db.execute(
            """SELECT i.id AS item_id, i.produto, a.valor_arremate AS valor, a.doado
                 FROM arremates_vencedores a JOIN itens i ON i.id = a.item_id
                WHERE a.arrematante_id = ? ORDER BY i.id, a.id""", (pid,))]
        return erro(f"{pessoa['nome']} tem {lances} lance(s) registrado(s).", 409, codigo="tem_lances",
                    lances=lances, vendas=vendas, total=round(sum(v["valor"] for v in vendas), 2))
    try:
        db.execute("BEGIN IMMEDIATE")
        db.execute("DELETE FROM arremates WHERE arrematante_id = ?", (pid,))
        sem_doador = db.execute("UPDATE itens SET doador_id = NULL WHERE doador_id = ?", (pid,)).rowcount
        db.execute("DELETE FROM pessoas WHERE id = ?", (pid,))
        db.commit()
    except sqlite3.Error:
        db.rollback()
        raise
    return jsonify({"ok": True, "lances_apagados": lances, "itens_sem_doador": sem_doador})


@app.get("/api/pessoas/busca")
def api_buscar_pessoas():
    q = normalizar(request.args.get("q", "").strip())
    if not q:
        return jsonify([])
    q = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    rows = get_db().execute(
        """SELECT id, nome, cpf, funcao FROM pessoas
            WHERE norm(nome) LIKE ? ESCAPE '\\'
            ORDER BY (norm(nome) LIKE ? ESCAPE '\\') DESC, nome COLLATE NOCASE
            LIMIT 8""",
        (f"%{q}%", f"{q}%"),
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.get("/api/pessoas/<int:pid>")
def api_pessoa(pid):
    row = get_db().execute("SELECT id, nome, cpf, telefone, funcao FROM pessoas WHERE id = ?", (pid,)).fetchone()
    if row is None:
        return erro(f"Cadastro nº {pid} não encontrado.", 404)
    return jsonify(dict(row))


@app.get("/api/pessoas")
def api_listar_pessoas():
    """Lista paginada por limite, com filtro por nome (sem acento) ou número de cadastro."""
    q = request.args.get("q", "").strip()
    where, params = "", []
    if q:
        nq = normalizar(q).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where = "WHERE norm(p.nome) LIKE ? ESCAPE '\\'"
        params.append(f"%{nq}%")
        if q.isascii() and q.isdigit():
            where = "WHERE (norm(p.nome) LIKE ? ESCAPE '\\' OR p.id = ?)"
            params.append(int(q))
    db = get_db()
    total = db.execute(f"SELECT COUNT(*) AS n FROM pessoas p {where}", params).fetchone()["n"]
    rows = db.execute(
        f"""SELECT p.id, p.nome, p.cpf, p.telefone, p.endereco, p.funcao,
                   COUNT(v.id) AS qtd_itens, COALESCE(SUM(v.valor_arremate), 0) AS total
              FROM pessoas p
              LEFT JOIN arremates_vencedores v ON v.arrematante_id = p.id
              {where}
             GROUP BY p.id
             ORDER BY p.nome COLLATE NOCASE, p.id
             LIMIT 300""",
        params,
    ).fetchall()
    return jsonify({"total": total, "pessoas": [dict(r) for r in rows]})


# --------------------------------------------------------------------------- API: tipos de item
@app.get("/api/tipos")
def api_listar_tipos():
    rows = get_db().execute("SELECT id, nome FROM tipos_item ORDER BY nome COLLATE NOCASE").fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/tipos")
def api_criar_tipo():
    d = request.get_json(silent=True) or {}
    nome = re.sub(r"\s+", " ", txt(d, "nome") or "")
    if not nome:
        return erro("Digite o nome do tipo.", 422, campo="nome")
    if len(nome) > 60:
        return erro("O nome do tipo pode ter no máximo 60 caracteres.", 422, campo="nome")
    db = get_db()

    def existente():  # "bolo", "Bolo" e "BÓLO" são o mesmo tipo
        return db.execute("SELECT id, nome FROM tipos_item WHERE norm(nome) = ?", (normalizar(nome),)).fetchone()

    row = existente()
    if row is None:
        try:
            cur = db.execute("INSERT INTO tipos_item (nome) VALUES (?)", (nome,))
            db.commit()
            return jsonify({"id": cur.lastrowid, "nome": nome}), 201
        except sqlite3.IntegrityError:  # outro operador cadastrou o mesmo nome agora há pouco
            db.rollback()
            row = existente()
    return erro(f'O tipo "{row["nome"]}" já existe.', 409, tipo=dict(row))


# --------------------------------------------------------------------------- API: itens
ITEM_SQL = """
    SELECT i.id, i.produto, i.descricao, i.valor_minimo, i.doador_id, d.nome AS doador_nome,
           i.tipo_id, t.nome AS tipo_nome,
           a.id AS arremate_id, a.valor_arremate, a.arrematante_id, p.nome AS arrematante_nome,
           (SELECT COUNT(*) FROM arremates x WHERE x.item_id = i.id AND x.doado = 1) AS doacoes
      FROM itens i
      LEFT JOIN pessoas d ON d.id = i.doador_id
      LEFT JOIN tipos_item t ON t.id = i.tipo_id
      LEFT JOIN lider_atual a ON a.item_id = i.id
      LEFT JOIN pessoas p ON p.id = a.arrematante_id
     WHERE i.id = ?"""


def item_json(row):
    out = {k: row[k] for k in ("id", "produto", "descricao", "valor_minimo", "doador_id", "doador_nome",
                                "tipo_id", "tipo_nome")}
    out["doacoes"] = row["doacoes"]
    out["arrematado"] = None
    if row["arremate_id"] is not None:
        out["arrematado"] = {
            "id": row["arremate_id"],
            "valor": row["valor_arremate"],
            "arrematante_id": row["arrematante_id"],
            "arrematante_nome": row["arrematante_nome"],
        }
    return out


@app.get("/api/item/<int:iid>")
def api_item(iid):
    row = get_db().execute(ITEM_SQL, (iid,)).fetchone()
    if row is None:
        return erro(f"Item nº {iid} não encontrado.", 404)
    return jsonify(item_json(row))


def padrao_like(q):
    """Texto sem acento e com curingas escapados, para LIKE ... ESCAPE '\\'."""
    return normalizar(q).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


DOADO_SQL = "EXISTS (SELECT 1 FROM arremates x WHERE x.item_id = i.id AND x.doado = 1)"


@app.get("/api/itens/proximo")
def api_proximo_item():
    return jsonify({"proximo": get_db().execute("SELECT COALESCE(MAX(id), 0) + 1 AS p FROM itens").fetchone()["p"]})


@app.get("/api/itens")
def api_listar_itens():
    """Itens com filtros: q (número, produto, tipo, descrição, doador), situacao e doacao."""
    q = request.args.get("q", "").strip()
    situacao = request.args.get("situacao", "")
    doacao = request.args.get("doacao", "")
    where, params = [], []
    if q:
        like = f"%{padrao_like(q)}%"
        cond = ("(norm(i.produto) LIKE ? ESCAPE '\\' OR norm(i.descricao) LIKE ? ESCAPE '\\' "
                "OR norm(d.nome) LIKE ? ESCAPE '\\' OR norm(t.nome) LIKE ? ESCAPE '\\'")
        params += [like, like, like, like]
        if q.isascii() and q.isdigit():
            cond += " OR i.id = ?"
            params.append(int(q))
        where.append(cond + ")")
    if situacao == "disponivel":
        where.append("l.item_id IS NULL")          # sem lance atual (nunca teve ou foi doado de volta)
    elif situacao == "arrematado":
        where.append("l.item_id IS NOT NULL")
    if doacao == "com":
        where.append(DOADO_SQL)
    elif doacao == "sem":
        where.append("NOT " + DOADO_SQL)
    de = """FROM itens i
              LEFT JOIN pessoas d ON d.id = i.doador_id
              LEFT JOIN tipos_item t ON t.id = i.tipo_id
              LEFT JOIN lider_atual l ON l.item_id = i.id
              LEFT JOIN pessoas p ON p.id = l.arrematante_id"""
    filtro = ("WHERE " + " AND ".join(where)) if where else ""
    db = get_db()
    total = db.execute(f"SELECT COUNT(*) AS n {de} {filtro}", params).fetchone()["n"]
    rows = db.execute(
        f"""SELECT i.id, i.produto, i.descricao, i.valor_minimo, i.doador_id, d.nome AS doador_nome,
                   i.tipo_id, t.nome AS tipo_nome,
                   l.valor_arremate AS lance_valor, l.arrematante_id, p.nome AS arrematante_nome,
                   (SELECT COUNT(*) FROM arremates x WHERE x.item_id = i.id AND x.doado = 1) AS doacoes
              {de} {filtro}
             ORDER BY i.id LIMIT 300""",
        params,
    ).fetchall()
    return jsonify({"total": total, "itens": [dict(r) for r in rows]})


def validar_item(d, db):
    """Valida os campos de um item. Devolve (dados, None) ou (None, resposta_de_erro)."""
    produto = txt(d, "produto")
    if not produto:
        return None, erro("Informe o produto.", 422, campo="produto")

    ordem = None
    if txt(d, "id"):
        ordem = to_int(d.get("id"))
        if not ordem:
            return None, erro("O número de ordem deve ser um inteiro positivo.", 422, campo="id")

    valor_min = 0.0
    if txt(d, "valor_minimo"):
        valor_min = parse_valor(d.get("valor_minimo"))
        if valor_min is None or valor_min < 0:
            return None, erro("Valor mínimo inválido.", 422, campo="valor_minimo")

    doador_id = None
    if txt(d, "doador_id"):
        doador_id = to_int(d.get("doador_id"))
        if not doador_id or db.execute("SELECT 1 FROM pessoas WHERE id = ?", (doador_id,)).fetchone() is None:
            return None, erro("Doador não encontrado.", 422, campo="doador")

    tipo_id = None
    if txt(d, "tipo_id"):
        tipo_id = to_int(d.get("tipo_id"))
        if not tipo_id or db.execute("SELECT 1 FROM tipos_item WHERE id = ?", (tipo_id,)).fetchone() is None:
            return None, erro("Tipo não encontrado. Atualize a lista de tipos.", 422, campo="tipo")

    return {"ordem": ordem, "produto": produto, "valor_min": valor_min,
            "descricao": txt(d, "descricao"), "doador_id": doador_id, "tipo_id": tipo_id}, None


@app.post("/api/itens")
def api_criar_item():
    db = get_db()
    v, resposta = validar_item(request.get_json(silent=True) or {}, db)
    if resposta:
        return resposta
    try:
        if v["ordem"] is None:
            cur = db.execute(
                "INSERT INTO itens (produto, valor_minimo, descricao, doador_id, tipo_id) VALUES (?, ?, ?, ?, ?)",
                (v["produto"], v["valor_min"], v["descricao"], v["doador_id"], v["tipo_id"]),
            )
        else:
            cur = db.execute(
                "INSERT INTO itens (id, produto, valor_minimo, descricao, doador_id, tipo_id) VALUES (?, ?, ?, ?, ?, ?)",
                (v["ordem"], v["produto"], v["valor_min"], v["descricao"], v["doador_id"], v["tipo_id"]),
            )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return erro(f"Já existe um item com o número {v['ordem']}.", 409, campo="id")

    novo = item_json(db.execute(ITEM_SQL, (cur.lastrowid,)).fetchone())
    novo["proximo"] = db.execute("SELECT COALESCE(MAX(id), 0) + 1 AS p FROM itens").fetchone()["p"]
    return jsonify(novo), 201


@app.put("/api/itens/<int:iid>")
def api_editar_item(iid):
    """Altera o item. O número de ordem só pode mudar se o item ainda não tem lances."""
    db = get_db()
    if db.execute("SELECT 1 FROM itens WHERE id = ?", (iid,)).fetchone() is None:
        return erro(f"Item nº {iid} não encontrado.", 404)
    v, resposta = validar_item(request.get_json(silent=True) or {}, db)
    if resposta:
        return resposta
    novo_id = v["ordem"] or iid
    try:
        db.execute("BEGIN IMMEDIATE")
        if novo_id != iid:
            if db.execute("SELECT 1 FROM arremates WHERE item_id = ?", (iid,)).fetchone():
                db.rollback()
                return erro("Este item já tem lances registrados, então o número de ordem não pode mudar.", 409, campo="id")
            if db.execute("SELECT 1 FROM itens WHERE id = ?", (novo_id,)).fetchone():
                db.rollback()
                return erro(f"Já existe um item com o número {novo_id}.", 409, campo="id")
        db.execute(
            "UPDATE itens SET id = ?, produto = ?, valor_minimo = ?, descricao = ?, doador_id = ?, tipo_id = ? WHERE id = ?",
            (novo_id, v["produto"], v["valor_min"], v["descricao"], v["doador_id"], v["tipo_id"], iid),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return erro("Não foi possível salvar as alterações do item.", 409)
    out = item_json(db.execute(ITEM_SQL, (novo_id,)).fetchone())
    out["proximo"] = db.execute("SELECT COALESCE(MAX(id), 0) + 1 AS p FROM itens").fetchone()["p"]
    return jsonify(out)


@app.delete("/api/itens/<int:iid>")
def api_excluir_item(iid):
    """Exclui o item. Se ele tem lances, só com forcar=1, o que apaga também os lances (e muda promissórias)."""
    forcar = request.args.get("forcar") == "1"
    db = get_db()
    item = db.execute("SELECT id, produto FROM itens WHERE id = ?", (iid,)).fetchone()
    if item is None:
        return erro(f"Item nº {iid} não encontrado.", 404)
    lances = db.execute("SELECT COUNT(*) AS n FROM arremates WHERE item_id = ?", (iid,)).fetchone()["n"]
    if lances and not forcar:
        vendas = [dict(r) for r in db.execute(
            """SELECT p.id AS pessoa_id, p.nome, a.valor_arremate AS valor, a.doado
                 FROM arremates_vencedores a JOIN pessoas p ON p.id = a.arrematante_id
                WHERE a.item_id = ? ORDER BY a.id""", (iid,))]
        return erro(f"O item {iid} ({item['produto']}) tem {lances} lance(s) registrado(s).", 409, codigo="tem_lances",
                    lances=lances, vendas=vendas, total=round(sum(v["valor"] for v in vendas), 2))
    try:
        db.execute("BEGIN IMMEDIATE")
        db.execute("DELETE FROM arremates WHERE item_id = ?", (iid,))
        db.execute("DELETE FROM itens WHERE id = ?", (iid,))
        db.commit()
    except sqlite3.Error:
        db.rollback()
        raise
    return jsonify({"ok": True, "lances_apagados": lances})


# --------------------------------------------------------------------------- API: arremates
ULTIMOS_SQL = """
    SELECT a.id, a.item_id, i.produto, i.valor_minimo, a.arrematante_id, p.nome AS arrematante_nome,
           a.valor_arremate AS valor, a.data_hora, a.doado,
           (a.doado = 0 AND a.id = (SELECT MAX(b.id) FROM arremates b WHERE b.item_id = a.item_id)) AS lider,
           (a.doado = 1 AND a.id = (SELECT MAX(b.id) FROM arremates b WHERE b.item_id = a.item_id)) AS desfazivel
      FROM arremates a
      JOIN itens i ON i.id = a.item_id
      JOIN pessoas p ON p.id = a.arrematante_id
     {where}
     ORDER BY a.id DESC {limite}"""


@app.get("/api/arremates/ultimos")
def api_ultimos_arremates():
    rows = get_db().execute(ULTIMOS_SQL.format(where="", limite="LIMIT 5")).fetchall()
    return jsonify([dict(r) for r in rows])


def lider_do_item(db, item_id):
    """Maior lance atual do item (None se não há lance ou se o item foi doado de volta)."""
    row = db.execute(
        """SELECT l.id, l.valor_arremate AS valor, l.arrematante_id, p.nome AS arrematante_nome
             FROM lider_atual l JOIN pessoas p ON p.id = l.arrematante_id
            WHERE l.item_id = ?""",
        (item_id,),
    ).fetchone()
    return dict(row) if row else None


@app.post("/api/arremates")
def api_criar_arremate():
    """Registra um lance. Só vale se atingir o mínimo do item E superar o maior lance atual.
    Item doado de volta ao leilão não tem lance atual: basta atingir o mínimo (inclusive o doador)."""
    d = request.get_json(silent=True) or {}
    db = get_db()

    item_id, pessoa_id = to_int(d.get("item_id")), to_int(d.get("arrematante_id"))
    item = db.execute("SELECT id, produto, valor_minimo FROM itens WHERE id = ?", (item_id,)).fetchone() if item_id else None
    if item is None:
        return erro("Item não encontrado.", 404, campo="item")
    if not pessoa_id or db.execute("SELECT 1 FROM pessoas WHERE id = ?", (pessoa_id,)).fetchone() is None:
        return erro("Arrematante não encontrado.", 404, campo="arrematante")

    valor = parse_valor(d.get("valor"))
    if valor is None or valor <= 0:
        return erro("Informe um valor maior que zero.", 422, campo="valor")

    # 1) mínimo do item (igual ao mínimo é aceito: o lance "atinge" o mínimo)
    if valor + 1e-9 < item["valor_minimo"]:
        return erro(f"O valor não atinge o mínimo do item ({brl(item['valor_minimo'])}).", 409,
                    codigo="abaixo_minimo", valor_minimo=item["valor_minimo"])

    agora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        db.execute("BEGIN IMMEDIATE")  # trava escrita: dois operadores não furam a fila
        # 2) precisa ser estritamente maior que o maior lance atual
        anterior = lider_do_item(db, item["id"])
        if anterior and valor <= anterior["valor"] + 1e-9:
            db.rollback()
            return erro(
                f"O lance precisa ser maior que o maior lance atual ({brl(anterior['valor'])}, "
                f"de {anterior['arrematante_nome']}).", 409,
                codigo="lance_insuficiente", lance_atual=anterior["valor"])
        cur = db.execute(
            "INSERT INTO arremates (item_id, arrematante_id, valor_arremate, data_hora) VALUES (?, ?, ?, ?)",
            (item["id"], pessoa_id, valor, agora),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return erro("Não foi possível registrar o lance. Confira os dados e tente de novo.", 409,
                    codigo="lance_insuficiente")

    row = db.execute(ULTIMOS_SQL.format(where="WHERE a.id = ?", limite=""), (cur.lastrowid,)).fetchone()
    out = dict(row)
    out["anterior"] = ({"nome": anterior["arrematante_nome"], "valor": anterior["valor"]} if anterior else None)
    return jsonify(out), 201


@app.post("/api/arremates/<int:aid>/doar")
def api_doar(aid):
    """O arrematante doa o item: a venda continua valendo, mas o item volta ao leilão (a partir do mínimo)."""
    db = get_db()
    if db.execute("SELECT 1 FROM arremates WHERE id = ?", (aid,)).fetchone() is None:
        return erro("Lance não encontrado.", 404)
    try:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            """SELECT l.id, l.item_id, l.valor_arremate AS valor, l.arrematante_id, p.nome AS arrematante_nome,
                      i.produto, i.valor_minimo
                 FROM lider_atual l JOIN itens i ON i.id = l.item_id JOIN pessoas p ON p.id = l.arrematante_id
                WHERE l.id = ?""",
            (aid,),
        ).fetchone()
        if row is None:  # superado, já doado ou não é o último lance do item
            db.rollback()
            return erro("Só o maior lance atual de um item pode ser doado (este já foi doado ou foi superado).", 409)
        db.execute("UPDATE arremates SET doado = 1 WHERE id = ?", (aid,))
        db.commit()
    except sqlite3.Error:
        db.rollback()
        raise
    out = dict(row)
    out["ok"] = True
    out["doacoes"] = db.execute("SELECT COUNT(*) AS n FROM arremates WHERE item_id = ? AND doado = 1",
                                (row["item_id"],)).fetchone()["n"]
    return jsonify(out)


@app.delete("/api/arremates/<int:aid>/doacao")
def api_desfazer_doacao(aid):
    """Desfaz uma doação registrada por engano. Só vale enquanto ninguém deu lance depois dela."""
    db = get_db()
    try:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT item_id, doado FROM arremates WHERE id = ?", (aid,)).fetchone()
        if row is None:
            db.rollback()
            return erro("Lance não encontrado.", 404)
        if not row["doado"]:
            db.rollback()
            return erro("Este lance não está marcado como doado.", 409)
        if db.execute("SELECT 1 FROM arremates WHERE item_id = ? AND id > ?", (row["item_id"], aid)).fetchone():
            db.rollback()
            return erro("Já existem lances depois da doação deste item. Cancele-os antes de desfazer a doação.", 409)
        db.execute("UPDATE arremates SET doado = 0 WHERE id = ?", (aid,))
        db.commit()
    except sqlite3.Error:
        db.rollback()
        raise
    return jsonify({"ok": True, "item_id": row["item_id"]})


@app.delete("/api/arremates/<int:aid>")
def api_excluir_arremate(aid):
    """Cancela um lance. Se era o maior, o lance anterior volta a ser o vencedor."""
    db = get_db()
    row = db.execute("SELECT item_id FROM arremates WHERE id = ?", (aid,)).fetchone()
    if row is None:
        return erro("Lance não encontrado (talvez já tenha sido cancelado).", 404)
    db.execute("DELETE FROM arremates WHERE id = ?", (aid,))
    db.commit()
    return jsonify({"ok": True, "item_id": row["item_id"], "lider": lider_do_item(db, row["item_id"])})


# --------------------------------------------------------------------------- PDF: nota promissória
VERDE = colors.HexColor("#1F5140")
VERDE_CLARO = colors.HexColor("#DCE9E1")
LINHA = colors.HexColor("#9FB0A6")


class LinhaPontilhada(Flowable):
    """Linha pontilhada com legendas abaixo (assinatura) ou sem legenda (preenchimento manual)."""

    def __init__(self, largura, altura, y_linha, legendas=()):
        super().__init__()
        self.largura, self.altura, self.y_linha, self.legendas = largura, altura, y_linha, legendas
        self.hAlign = "CENTER"

    def wrap(self, _w, _h):
        return self.largura, self.altura

    def draw(self):
        c = self.canv
        c.saveState()
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.8)
        c.setDash(1, 3)
        c.line(0, self.y_linha, self.largura, self.y_linha)
        c.setDash()
        c.setFont("Helvetica", 9)
        y = self.y_linha - 4 * mm
        for texto in self.legendas:
            c.drawCentredString(self.largura / 2, y, texto)
            y -= 4 * mm
        c.restoreState()


def gerar_promissoria_pdf(pessoa, arremates):
    total = round(sum(a["valor_arremate"] for a in arremates), 2)
    agora = datetime.now().strftime("%d/%m/%Y %H:%M")

    base = getSampleStyleSheet()["Normal"]
    normal = ParagraphStyle("n", parent=base, fontName="Helvetica", fontSize=10, leading=13)
    titulo = ParagraphStyle("t", parent=normal, fontName="Helvetica-Bold", fontSize=20, leading=24, alignment=TA_CENTER)
    sub = ParagraphStyle("s", parent=normal, fontName="Helvetica-Bold", fontSize=12, leading=16,
                         alignment=TA_CENTER, textColor=VERDE, spaceAfter=8 * mm)
    h2 = ParagraphStyle("h2", parent=normal, fontName="Helvetica-Bold", fontSize=11, leading=14, spaceAfter=2 * mm)

    def p(t, st=normal):
        return Paragraph(t, st)

    def val(v):
        return p(xml_escape(v) if v else "—")

    cliente = Table(
        [
            [p("<b>Cliente</b>"), val(pessoa["nome"]), p("<b>Nº de cadastro</b>"), p(str(pessoa["id"]))],
            [p("<b>CPF</b>"), val(pessoa["cpf"]), p("<b>Telefone</b>"), val(pessoa["telefone"])],
            [p("<b>Endereço</b>"), val(pessoa["endereco"]), "", ""],
        ],
        colWidths=[26 * mm, 66 * mm, 32 * mm, 46 * mm],
    )
    cliente.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, VERDE),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, LINHA),
        ("SPAN", (1, 2), (3, 2)),
        ("BACKGROUND", (0, 0), (0, -1), VERDE_CLARO),
        ("BACKGROUND", (2, 0), (2, 1), VERDE_CLARO),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))

    est_cab = ParagraphStyle("cab", parent=normal, fontName="Helvetica-Bold", textColor=colors.white)
    cab = [
        p("Nº de ordem", ParagraphStyle("cab0", parent=est_cab, alignment=TA_CENTER)),
        p("Produto", est_cab),
        p("Valor do arremate", ParagraphStyle("cab2", parent=est_cab, alignment=TA_RIGHT)),
    ]

    celula_valor = ParagraphStyle("cv", parent=normal, alignment=TA_RIGHT)
    celula_num = ParagraphStyle("cn", parent=normal, alignment=TA_CENTER)
    if arremates:
        linhas = [[p(str(a["id"]), celula_num), p(xml_escape(a["produto"]) + (" <b>(D)</b>" if a["doado"] else ""), normal),
                   p(brl(a["valor_arremate"]), celula_valor)]
                  for a in arremates]
        alturas = None
    else:  # sem arremates: linhas em branco para preenchimento manual
        linhas = [["", "", ""] for _ in range(6)]
        alturas = [None] + [9 * mm] * 6

    estilo_itens = [
        ("BACKGROUND", (0, 0), (-1, 0), VERDE),
        ("GRID", (0, 0), (-1, -1), 0.5, LINHA),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if arremates:
        estilo_itens.append(("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F1F5F2")]))
    tabela = Table([cab] + linhas, colWidths=[26 * mm, 102 * mm, 42 * mm], repeatRows=1, rowHeights=alturas)
    tabela.setStyle(TableStyle(estilo_itens))

    total_tab = Table([["Valor total geral", brl(total)]], colWidths=[128 * mm, 42 * mm])
    total_tab.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("BACKGROUND", (0, 0), (-1, -1), VERDE_CLARO),
        ("BOX", (0, 0), (-1, -1), 1, VERDE),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    fecho = KeepTogether([
        p(f"Reconheço como dívida os valores acima, referentes aos itens arrematados no "
          f"{xml_escape(LEILAO_NOME)}, e comprometo-me a pagá-los à organização do evento."),
        Spacer(1, 6 * mm),
        p("Valor total por extenso:"),
        LinhaPontilhada(170 * mm, 9 * mm, 2 * mm),
        Spacer(1, 4 * mm),
        p(f"Emitida em {agora}"),
        Spacer(1, 14 * mm),
        LinhaPontilhada(110 * mm, 18 * mm, 12 * mm, ("Assinatura do cliente", pessoa["nome"])),
    ])

    historia = [
        Paragraph(xml_escape(LEILAO_NOME), titulo),
        Paragraph("NOTA PROMISSÓRIA", sub),
        cliente, Spacer(1, 8 * mm),
        Paragraph("Itens arrematados", h2),
        tabela, Spacer(1, 3 * mm),
        total_tab,
        *([Spacer(1, 2 * mm), p("<b>(D)</b> Item doado: o valor continua devido e o item voltou ao leilão.",
                                ParagraphStyle("leg", parent=normal, fontSize=8.5, textColor=colors.HexColor("#4B5A52")))]
          if any(a["doado"] for a in arremates) else []),
        Spacer(1, 10 * mm),
        fecho,
    ]

    def rodape(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.grey)
        canvas.drawString(20 * mm, 10 * mm, LEILAO_NOME)
        canvas.drawRightString(A4[0] - 20 * mm, 10 * mm, f"Página {doc.page}")
        canvas.restoreState()

    buf = io.BytesIO()
    SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=20 * mm,
        title=f"Nota promissória - {pessoa['nome']}", author=LEILAO_NOME,
    ).build(historia, onFirstPage=rodape, onLaterPages=rodape)
    return buf.getvalue()


@app.get("/promissoria/<int:pessoa_id>")
def promissoria(pessoa_id):
    db = get_db()
    pessoa = db.execute("SELECT * FROM pessoas WHERE id = ?", (pessoa_id,)).fetchone()
    if pessoa is None:
        return f"Cadastro nº {pessoa_id} não encontrado.", 404
    arremates = db.execute(
        """SELECT i.id, i.produto, a.valor_arremate, a.doado
             FROM arremates_vencedores a JOIN itens i ON i.id = a.item_id
            WHERE a.arrematante_id = ? ORDER BY i.id, a.id""",
        (pessoa_id,),
    ).fetchall()
    pdf = gerar_promissoria_pdf(pessoa, arremates)
    resp = send_file(io.BytesIO(pdf), mimetype="application/pdf", download_name=f"promissoria_{pessoa_id}.pdf")
    resp.headers["Cache-Control"] = "no-store"  # a promissória muda a cada lance
    return resp


if __name__ == "__main__":
    # host 0.0.0.0: outros computadores da rede abrem http://IP-DESTE-PC:5000
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False, threaded=True)
