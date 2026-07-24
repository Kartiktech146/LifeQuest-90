import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export async function getDb() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  // Keep local setup beginner-friendly: the first API request creates the
  // required tables automatically. The SQL migrations remain available for
  // managed/production deployments.
  const setupStatements = [
    `CREATE TABLE IF NOT EXISTS user_states (
      user_key TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      channel TEXT NOT NULL,
      destination TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS otp_challenges (
      id TEXT PRIMARY KEY NOT NULL,
      channel TEXT NOT NULL,
      destination TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER DEFAULT 0 NOT NULL,
      consumed_at INTEGER,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS otp_destination_created_idx
      ON otp_challenges(destination, created_at)`,
    `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`,
  ];

  // D1's exec endpoint accepts one statement reliably across both local
  // Miniflare and hosted Workers. Sending a multi-statement string can be
  // truncated at the first semicolon and reported as "incomplete input".
  for (const statement of setupStatements) {
  await env.DB.prepare(statement).run();
}

  return drizzle(env.DB, { schema });
}
