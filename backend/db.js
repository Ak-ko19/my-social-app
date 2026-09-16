const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'social_app_db',
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
});

module.exports = pool;