-- Администрирование: уровень помощника, блокировка, последний вход, журнал действий.
ALTER TABLE users ADD COLUMN IF NOT EXISTS helper_level SMALLINT CHECK (helper_level BETWEEN 1 AND 3);
-- statement-break
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
-- statement-break
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
-- statement-break
CREATE TABLE IF NOT EXISTS admin_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_login TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  target_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_login TEXT,
  action TEXT NOT NULL,
  details JSONB
);
-- statement-break
CREATE INDEX IF NOT EXISTS admin_log_at_idx ON admin_log(at DESC);
-- statement-break
CREATE INDEX IF NOT EXISTS admin_log_actor_idx ON admin_log(actor_id, at DESC);
