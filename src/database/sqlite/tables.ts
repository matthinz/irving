export const TABLES = {
  blobs: `
    CREATE TABLE IF NOT EXISTS blobs (
      id INTEGER PRIMARY KEY ASC,
      content_gz BLOB NOT NULL,
      md5 TEXT UNIQUE
    );
  `,
  domains: `
      CREATE TABLE IF NOT EXISTS domains (
        id INTEGER PRIMARY KEY ASC,
        name string NOT NULL,
        parent_id INTEGER NOT NULL,
        full_name string NOT NULL UNIQUE,
        ok_to_spider INTEGER NULL,
        UNIQUE(name, parent_id)
      );
    `,
  domain_links: `
    CREATE TABLE IF NOT EXISTS domain_links (
      from_domain_id INTEGER NOT NULL,
      to_url_id INTEGER NOT NULL,
      index_version INTEGER NOT NULL,
      strength INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (from_domain_id, to_url_id, index_version)
    )
  `,
  domain_signals: `
    CREATE TABLE IF NOT EXISTS domain_signals (
      domain_id INTEGER NOT NULL,
      signal_id INTEGER NOT NULL,
      index_version INTEGER NOT NULL,
      strength INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (domain_id, signal_id, index_version)
    );
  `,
  queue: `
      CREATE TABLE IF NOT EXISTS queue (
        id INTEGER PRIMARY KEY ASC,
        timestamp INTEGER NOT NULL,
        url_id INTEGER NOT NULL UNIQUE,
        priority INTEGER NOT NULL,
        requested_at INTEGER NULL
      );
      CREATE INDEX IF NOT EXISTS ix_queue_requested_at ON queue (requested_at);
      CREATE INDEX IF NOT EXISTS ix_queue_priority ON queue (priority);
      CREATE INDEX IF NOT EXISTS ix_queue_priority_requested_at ON queue (priority, requested_at);
    `,
  requests: `
      CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY ASC,
        session_id INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        url_id INTEGER NOT NULL,
        status INTEGER NOT NULL DEFAULT 0,
        content_type TEXT,
        headers_blob_id INTEGER,
        body_blob_id INTEGER,
        last_index_version INTEGER NULL
      );
      CREATE INDEX IF NOT EXISTS ix_requests_url ON requests (url_id);
      CREATE INDEX IF NOT EXISTS ix_requests_for_indexing ON requests (id, status, last_index_version);
    `,
  request_errors: `
    CREATE TABLE IF NOT EXISTS request_errors (
      id INTEGER PRIMARY KEY ASC,
      session_id INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      url_id INTEGER NOT NULL,
      error_code TEXT NOT NULL,
      error_message TEXT NOT NULL
    )
  `,
  sessions: `
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY ASC,
        timestamp INTEGER
      )
    `,
  signals: `
        CREATE TABLE IF NOT EXISTS signals (
          id INTEGER PRIMARY KEY ASC,
          name TEXT UNIQUE,
          timestamp INTEGER
        )
    `,
  urls: `
    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY ASC,
      url TEXT UNIQUE,
      domain_id INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_urls_domain ON urls (domain_id);
  `,
};

export type TableName = keyof typeof TABLES;
