import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb } from './connection.js';

export async function runMigrations() {
  const db = getDb();
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');
}

// Allow running directly: tsx src/db/migrate.ts
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
