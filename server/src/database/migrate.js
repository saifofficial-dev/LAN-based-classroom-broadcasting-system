// server/src/database/migrate.js
const { initDatabase } = require('../config/database');

async function migrate() {
  try {
    await initDatabase();
    console.log('[Migration] Database initialized successfully');
    process.exit(0);
  } catch (err) {
    console.error('[Migration] Error:', err.message);
    process.exit(1);
  }
}

migrate();
