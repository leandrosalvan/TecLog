-- TecLog+ — esquema do banco (PostgreSQL / produção)
-- Sem FOREIGN KEYs: o app gerencia a integridade (evita a dependência circular
-- usuarios.perfil_id <-> perfis.terceirizado_id).

CREATE TABLE IF NOT EXISTS usuarios (
  id              SERIAL PRIMARY KEY,
  nome            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  telefone        TEXT,
  senha_hash      TEXT NOT NULL,
  papel           TEXT NOT NULL CHECK (papel IN ('terceirizado','quarteirizado')),
  terceirizado_id INTEGER,
  perfil_id       INTEGER,
  dia_ciclo       INTEGER,
  is_admin        INTEGER NOT NULL DEFAULT 0,
  vencimento      TEXT,
  plano           TEXT,
  limite_tecnicos INTEGER,
  teste_expira    TEXT,
  ativo           INTEGER NOT NULL DEFAULT 1,
  criado_em       TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS perfis (
  id              SERIAL PRIMARY KEY,
  terceirizado_id INTEGER NOT NULL,
  codigo          TEXT NOT NULL DEFAULT '',
  descricao       TEXT,
  ordem           INTEGER NOT NULL DEFAULT 0,
  ativo           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS classes_servico (
  id              SERIAL PRIMARY KEY,
  terceirizado_id INTEGER NOT NULL,
  nome            TEXT NOT NULL,
  ativo           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS valores (
  id         SERIAL PRIMARY KEY,
  classe_id  INTEGER NOT NULL,
  perfil_id  INTEGER NOT NULL,
  valor      DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE (classe_id, perfil_id)
);

CREATE TABLE IF NOT EXISTS clientes (
  id              SERIAL PRIMARY KEY,
  terceirizado_id INTEGER NOT NULL,
  nome            TEXT NOT NULL,
  tipo            TEXT CHECK (tipo IN ('PF','PJ')),
  criado_em       TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS ordens_servico (
  id                 SERIAL PRIMARY KEY,
  terceirizado_id    INTEGER NOT NULL,
  tecnico_id         INTEGER NOT NULL,
  cliente_id         INTEGER NOT NULL,
  classe_id          INTEGER NOT NULL,
  data_execucao      TEXT NOT NULL,
  valor_repasse      DOUBLE PRECISION,
  valor_cheio        DOUBLE PRECISION,
  repetida           INTEGER NOT NULL DEFAULT 0,
  repetida_detalhes  TEXT,
  repetida_por       INTEGER,
  repetida_em        TEXT,
  sinalizada         INTEGER NOT NULL DEFAULT 0,
  sinal_descricao    TEXT,
  sinal_imagem       TEXT,
  sinal_imagem_dados BYTEA,
  sinal_por          INTEGER,
  sinal_em           TEXT,
  criado_em          TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS notificacoes (
  id            SERIAL PRIMARY KEY,
  usuario_id    INTEGER NOT NULL,
  os_id         INTEGER,
  titulo        TEXT,
  mensagem      TEXT,
  lida          INTEGER NOT NULL DEFAULT 0,
  confirmada    INTEGER NOT NULL DEFAULT 0,
  confirmada_em TEXT,
  criado_em     TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
