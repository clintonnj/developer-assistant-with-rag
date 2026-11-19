CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS chunks (
  id SERIAL PRIMARY KEY,
  source_type TEXT NOT NULL,   -- operation | schema | concept | usecase | doc
  source_id TEXT NOT NULL,
  title TEXT,
  text TEXT NOT NULL,          -- embedded and sent to Claude
  metadata JSONB DEFAULT '{}', -- schema name, path, related operations, file name...
  embedding vector(768),
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED
);

CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON chunks USING gin (tsv);
