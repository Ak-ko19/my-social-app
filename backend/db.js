const { Pool } = require('pg');
const logger = require('./utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// When the database drops an IDLE connection (Neon suspending an idle
// database, a restart, a network blip), pg emits 'error' on the pool.
// Without a listener Node treats that as an uncaught exception and the
// whole server crashes. The broken client is already discarded; the next
// query opens a fresh connection -- so log it and carry on.
pool.on('error', (err) => {
  logger.error('database connection lost (idle client); a new one opens on the next query', { err });
});

module.exports = pool;
