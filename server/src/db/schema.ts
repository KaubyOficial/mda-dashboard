/** Schema SQLite (Story 2.1). Cache reconstruível — a planilha é a fonte da verdade. */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS leads (
  id            TEXT PRIMARY KEY,
  date          TEXT NOT NULL,
  email_key     TEXT NOT NULL,
  phone_key     TEXT NOT NULL,
  name_key      TEXT NOT NULL DEFAULT '',
  qualificacao  TEXT NOT NULL,
  temperatura   TEXT NOT NULL,
  origem        TEXT NOT NULL,
  pago_organico TEXT NOT NULL,
  utm_source    TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
  renda_brl     REAL,
  conhece       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_leads_date ON leads(date);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email_key);

CREATE TABLE IF NOT EXISTS agendamentos (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  email_key  TEXT NOT NULL,
  phone_key  TEXT NOT NULL,
  name_key   TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT '',
  compareceu INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ag_date ON agendamentos(date);

CREATE TABLE IF NOT EXISTS vendas (
  id        TEXT PRIMARY KEY,
  date      TEXT NOT NULL,
  email_key TEXT NOT NULL,
  phone_key TEXT NOT NULL,
  name_key  TEXT NOT NULL DEFAULT '',
  valor_brl REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_vendas_date ON vendas(date);

CREATE TABLE IF NOT EXISTS midia_diaria (
  date              TEXT PRIMARY KEY,
  investimento_brl  REAL NOT NULL DEFAULT 0,
  impressoes        INTEGER NOT NULL DEFAULT 0,
  alcance           INTEGER NOT NULL DEFAULT 0,
  cliques           INTEGER NOT NULL DEFAULT 0,
  cliques_botao_lp  INTEGER NOT NULL DEFAULT 0,
  vsl_plays         INTEGER NOT NULL DEFAULT 0,
  chegou_cadastro   INTEGER NOT NULL DEFAULT 0,
  forms_iniciados   INTEGER NOT NULL DEFAULT 0,
  forms_finalizados INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS midia_publico (
  date TEXT NOT NULL, publico TEXT NOT NULL,
  investimento_brl REAL NOT NULL DEFAULT 0, impressoes INTEGER NOT NULL DEFAULT 0, cliques INTEGER NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, publico)
);

CREATE TABLE IF NOT EXISTS midia_anuncio (
  date TEXT NOT NULL, anuncio TEXT NOT NULL,
  investimento_brl REAL NOT NULL DEFAULT 0, impressoes INTEGER NOT NULL DEFAULT 0, cliques INTEGER NOT NULL DEFAULT 0,
  lp_views INTEGER NOT NULL DEFAULT 0, vsl_plays INTEGER NOT NULL DEFAULT 0,
  chegou_cadastro INTEGER NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0, mqls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, anuncio)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status     TEXT NOT NULL,              -- running | ok | error
  source     TEXT,
  counts_json TEXT,
  warnings_json TEXT,
  error      TEXT
);

CREATE TABLE IF NOT EXISTS match_report (
  sync_id     INTEGER PRIMARY KEY,
  by_email    INTEGER NOT NULL DEFAULT 0,
  by_phone    INTEGER NOT NULL DEFAULT 0,
  by_name     INTEGER NOT NULL DEFAULT 0,
  unmatched   INTEGER NOT NULL DEFAULT 0,
  total_vendas INTEGER NOT NULL DEFAULT 0
);
`;
