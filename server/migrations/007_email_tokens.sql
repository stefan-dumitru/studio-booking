-- Up Migration

CREATE TABLE email_tokens (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose    TEXT        NOT NULL,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT email_tokens_purpose_valid
    CHECK (purpose IN ('verify_email', 'reset_password'))
);

COMMENT ON COLUMN email_tokens.token_hash IS
  'SHA-256 of the token. The raw token exists only in the email -- a database '
  'leak must not hand over working verification or reset links.';

-- Down Migration

DROP TABLE email_tokens;
