import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getDb(databaseUrl?: string) {
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  return drizzle(pool, { schema });
}

export type Database = ReturnType<typeof getDb>;

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
