"""Acesso ao banco — SQLite (dev local) ou PostgreSQL (produção via DATABASE_URL).

Expõe get_db() com uma API parecida com sqlite3 (execute/fetchone/fetchall/lastrowid/
iteração e linhas acessíveis por nome) tanto para SQLite quanto para Postgres.
"""
import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "teclog.db")
SCHEMA_SQLITE = os.path.join(BASE_DIR, "schema.sql")
SCHEMA_PG = os.path.join(BASE_DIR, "schema_pg.sql")

DATABASE_URL = os.environ.get("DATABASE_URL")
IS_PG = bool(DATABASE_URL)

if IS_PG:
    import psycopg2
    import psycopg2.extras


# ---------------------------------------------------------------------------
# Camada Postgres (tradução do SQL escrito para SQLite)
# ---------------------------------------------------------------------------
def _to_pg(sql):
    """Adapta um SQL pensado para SQLite ao Postgres. Retorna (sql, tem_returning)."""
    s = sql
    add_nothing = False
    if "INSERT OR IGNORE INTO" in s:
        s = s.replace("INSERT OR IGNORE INTO", "INSERT INTO")
        add_nothing = True
    s = s.replace("?", "%s")  # placeholders
    head = s.lstrip().upper()
    ret = False
    if head.startswith("INSERT") and "RETURNING" not in head:
        if add_nothing and "ON CONFLICT" not in head:
            s += " ON CONFLICT DO NOTHING"
        s += " RETURNING id"
        ret = True
    return s, ret


class _PgCursor:
    def __init__(self, cur, lastrowid):
        self._cur = cur
        self.lastrowid = lastrowid

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    def __iter__(self):
        return iter(self._cur.fetchall())


class _PgConn:
    """Conexão Postgres com a mesma cara de uma conexão sqlite3."""

    def __init__(self, raw):
        self._raw = raw

    def execute(self, sql, params=()):
        sql2, ret = _to_pg(sql)
        cur = self._raw.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql2, params)
        lastid = None
        if ret:
            try:
                row = cur.fetchone()
                if row is not None:
                    lastid = row.get("id")
            except psycopg2.ProgrammingError:
                lastid = None
        return _PgCursor(cur, lastid)

    def executescript(self, script):
        cur = self._raw.cursor()
        for stmt in script.split(";"):
            if stmt.strip():
                cur.execute(stmt)
        cur.close()

    def commit(self):
        self._raw.commit()

    def close(self):
        self._raw.close()


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------
def get_db():
    if IS_PG:
        url = DATABASE_URL
        if "sslmode=" not in url:
            url += ("&" if "?" in url else "?") + "sslmode=require"
        raw = psycopg2.connect(url)
        return _PgConn(raw)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Cria as tabelas (idempotente) e aplica migrações leves (só no SQLite)."""
    conn = get_db()
    if IS_PG:
        with open(SCHEMA_PG, "r", encoding="utf-8") as f:
            conn.executescript(f.read())
        conn.commit()
        conn.close()
        return

    with open(SCHEMA_SQLITE, "r", encoding="utf-8") as f:
        conn.executescript(f.read())

    # Migrações leves (bancos SQLite criados antes de cada feature)
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(perfis)")]
    if "ordem" not in cols:
        conn.execute("ALTER TABLE perfis ADD COLUMN ordem INTEGER NOT NULL DEFAULT 0")
        conn.execute("UPDATE perfis SET ordem = id")

    cols_u = [r["name"] for r in conn.execute("PRAGMA table_info(usuarios)")]
    if "dia_ciclo" not in cols_u:
        conn.execute("ALTER TABLE usuarios ADD COLUMN dia_ciclo INTEGER")
    if "is_admin" not in cols_u:
        conn.execute("ALTER TABLE usuarios ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
    if "vencimento" not in cols_u:
        conn.execute("ALTER TABLE usuarios ADD COLUMN vencimento TEXT")
    if "plano" not in cols_u:
        conn.execute("ALTER TABLE usuarios ADD COLUMN plano TEXT")
    if "limite_tecnicos" not in cols_u:
        conn.execute("ALTER TABLE usuarios ADD COLUMN limite_tecnicos INTEGER")
    if "telefone" not in cols_u:
        conn.execute("ALTER TABLE usuarios ADD COLUMN telefone TEXT")
    if "teste_expira" not in cols_u:
        conn.execute("ALTER TABLE usuarios ADD COLUMN teste_expira TEXT")

    cols_os = [r["name"] for r in conn.execute("PRAGMA table_info(ordens_servico)")]
    novas = {
        "sinalizada": "INTEGER NOT NULL DEFAULT 0",
        "sinal_descricao": "TEXT",
        "sinal_imagem": "TEXT",
        "sinal_imagem_dados": "BLOB",
        "sinal_por": "INTEGER",
        "sinal_em": "TEXT",
    }
    for col, tipo in novas.items():
        if col not in cols_os:
            conn.execute(f"ALTER TABLE ordens_servico ADD COLUMN {col} {tipo}")

    cols_n = [r["name"] for r in conn.execute("PRAGMA table_info(notificacoes)")]
    if "confirmada" not in cols_n:
        conn.execute("ALTER TABLE notificacoes ADD COLUMN confirmada INTEGER NOT NULL DEFAULT 0")
    if "confirmada_em" not in cols_n:
        conn.execute("ALTER TABLE notificacoes ADD COLUMN confirmada_em TEXT")

    conn.commit()
    conn.close()
