-- Пользователи сайта, сессии, одноразовые токены писем, журнал для ограничения частоты запросов.
-- Файл делится на команды маркером statement-break (так их умеет применять и Neon по HTTP, и PGlite).

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  login TEXT NOT NULL,
  login_lower TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  email_lower TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified_at TIMESTAMPTZ,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'helper')),
  lang TEXT NOT NULL DEFAULT 'ru' CHECK (lang IN ('ru', 'en', 'es')),
  timezone TEXT,
  consent_at TIMESTAMPTZ NOT NULL,
  consent_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- statement-break
CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
-- statement-break
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
-- statement-break
CREATE TABLE IF NOT EXISTS email_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('verify', 'reset')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- statement-break
CREATE INDEX IF NOT EXISTS email_tokens_user_idx ON email_tokens(user_id, kind);
-- statement-break
CREATE TABLE IF NOT EXISTS rate_events (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- statement-break
CREATE INDEX IF NOT EXISTS rate_events_key_idx ON rate_events(key, at);
-- statement-break
CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
