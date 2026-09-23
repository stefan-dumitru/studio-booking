-- Up Migration

-- The connect-pg-simple session store's table. Created here rather than letting
-- the library create it on boot, so the schema lives entirely in migration
-- history and a fresh database needs no special first-run step.
--
-- Shape is dictated by connect-pg-simple and must not be "tidied": it selects
-- on sid and expire by these exact names and types.
CREATE TABLE session (
  sid    VARCHAR      NOT NULL COLLATE "default",
  sess   JSON         NOT NULL,
  expire TIMESTAMP(6) NOT NULL,

  CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX "IDX_session_expire" ON session (expire);

COMMENT ON TABLE session IS
  'Server-side sessions. Chosen over JWTs so deactivating a member locks them '
  'out immediately -- see specifications/security.md > Authentication.';

-- Down Migration

DROP TABLE session;
