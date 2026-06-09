-- TecLog+ — esquema do banco (SQLite)
PRAGMA foreign_keys = ON;

-- Usuários: terceirizado (gestor+técnico) e quarteirizados (equipe)
CREATE TABLE IF NOT EXISTS usuarios (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nome            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  telefone        TEXT,
  senha_hash      TEXT NOT NULL,
  papel           TEXT NOT NULL CHECK(papel IN ('terceirizado','quarteirizado')),
  terceirizado_id INTEGER,                       -- dono da equipe (NULL se for o próprio terceirizado)
  perfil_id       INTEGER,                       -- perfil técnico (tec1, tec2...)
  dia_ciclo       INTEGER,                       -- dia do mês em que começa o ciclo (1-28); só no dono
  is_admin        INTEGER NOT NULL DEFAULT 0,     -- dono da plataforma (gerencia clientes)
  vencimento      TEXT,                           -- data de vencimento da assinatura (terceirizado)
  plano           TEXT,                           -- nome do plano contratado (informativo)
  limite_tecnicos INTEGER,                        -- máx. de técnicos (NULL = sem limite)
  teste_expira    TEXT,                           -- plano Teste: data/hora em que expira (24h)
  valor_personalizado REAL,                        -- mensalidade custom (plano Personalizado)
  apelido         TEXT,                            -- apelido da empresa do líder (vira o domínio dos e-mails da equipe)
  ativo           INTEGER NOT NULL DEFAULT 1,     -- 0 = suspenso (somente leitura)
  criado_em       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (terceirizado_id) REFERENCES usuarios(id),
  FOREIGN KEY (perfil_id)       REFERENCES perfis(id)
);

-- Perfis técnicos / níveis de repasse (tec1 = cheio, tec2/tec3... = parcial)
CREATE TABLE IF NOT EXISTS perfis (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  terceirizado_id INTEGER NOT NULL,
  codigo          TEXT NOT NULL DEFAULT '',      -- legado: não usado na interface
  descricao       TEXT,                          -- TÍTULO do perfil (escolhido pelo usuário)
  ordem           INTEGER NOT NULL DEFAULT 0,     -- ordem de exibição (setas ↑ ↓)
  ativo           INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (terceirizado_id) REFERENCES usuarios(id)
);

-- Classes de serviço (cada terceirizado tem as suas)
CREATE TABLE IF NOT EXISTS classes_servico (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  terceirizado_id INTEGER NOT NULL,
  nome            TEXT NOT NULL,                 -- INSTALAÇÃO, SUPORTE, DEVICES...
  ativo           INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (terceirizado_id) REFERENCES usuarios(id)
);

-- Matriz de valores: para cada (classe x perfil) -> valor
CREATE TABLE IF NOT EXISTS valores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  classe_id  INTEGER NOT NULL,
  perfil_id  INTEGER NOT NULL,
  valor      REAL NOT NULL DEFAULT 0,
  UNIQUE(classe_id, perfil_id),
  FOREIGN KEY (classe_id) REFERENCES classes_servico(id),
  FOREIGN KEY (perfil_id) REFERENCES perfis(id)
);

-- Clientes (nome/razão social é o ponto principal; PF ou PJ)
CREATE TABLE IF NOT EXISTS clientes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  terceirizado_id INTEGER NOT NULL,
  nome            TEXT NOT NULL,
  tipo            TEXT CHECK(tipo IN ('PF','PJ')),
  criado_em       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (terceirizado_id) REFERENCES usuarios(id)
);

-- Ordens de serviço (registro manual, espelho do sistema do provedor)
CREATE TABLE IF NOT EXISTS ordens_servico (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  terceirizado_id   INTEGER NOT NULL,
  tecnico_id        INTEGER NOT NULL,            -- quem executou/registrou
  cliente_id        INTEGER NOT NULL,
  classe_id         INTEGER NOT NULL,
  data_execucao     TEXT NOT NULL,
  valor_repasse     REAL,                        -- valor do perfil do técnico (snapshot)
  valor_cheio       REAL,                        -- valor tec1 (snapshot) p/ cálculo de retenção
  repetida          INTEGER NOT NULL DEFAULT 0,
  repetida_detalhes TEXT,                        -- texto descrito pelo terceirizado ao marcar
  repetida_por      INTEGER,                     -- terceirizado que marcou
  repetida_em       TEXT,
  sinalizada        INTEGER NOT NULL DEFAULT 0,  -- alerta/lembrete do dono
  sinal_descricao   TEXT,
  sinal_imagem      TEXT,                         -- flag de presença de imagem
  sinal_imagem_dados BLOB,                        -- bytes da imagem (anexo da sinalização)
  sinal_por         INTEGER,
  sinal_em          TEXT,
  criado_em         TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (terceirizado_id) REFERENCES usuarios(id),
  FOREIGN KEY (tecnico_id)      REFERENCES usuarios(id),
  FOREIGN KEY (cliente_id)      REFERENCES clientes(id),
  FOREIGN KEY (classe_id)       REFERENCES classes_servico(id)
);

-- Notificações (ex.: O.S marcada como repetida -> avisa o quarteirizado)
CREATE TABLE IF NOT EXISTS notificacoes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,                   -- destinatário
  os_id      INTEGER,
  titulo     TEXT,
  mensagem   TEXT,
  lida       INTEGER NOT NULL DEFAULT 0,
  confirmada    INTEGER NOT NULL DEFAULT 0,        -- "visto" do técnico (verificou/entendeu)
  confirmada_em TEXT,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (os_id)      REFERENCES ordens_servico(id)
);
