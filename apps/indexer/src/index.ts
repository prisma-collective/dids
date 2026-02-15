// Prisma DIDs Indexer — entrypoint
import { loadConfig } from './config/load-config.js';
import { getDb, closeDb } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { createServer } from './api/server.js';
import { BlockfrostSource } from './sources/blockfrost.js';
import { Poller } from './worker/poller.js';

async function main() {
  // 1. Load config
  const config = loadConfig();

  // 2. Connect to DB
  const db = getDb();
  console.log('Connected to PostgreSQL.');

  // 3. Run migrations
  await runMigrations();

  // 4. Create metadata source
  const apiKey = process.env.BLOCKFROST_API_KEY;
  if (!apiKey) {
    throw new Error('BLOCKFROST_API_KEY is required');
  }
  const source = new BlockfrostSource(apiKey, config.network);

  // 5. Start API server
  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || '0.0.0.0';
  const server = await createServer(config, db);
  await server.listen({ port, host });
  console.log(`Server listening on ${host}:${port}`);

  // 6. Start polling worker
  const poller = new Poller(db, source, config);
  poller.start();

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    poller.stop();
    await server.close();
    await closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
