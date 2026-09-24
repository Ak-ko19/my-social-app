// Shared entry point for every API test file. Call this once per test
// file (module scope, before any test runs) to get a Supertest-ready
// `app` backed by the real throwaway test Postgres cluster (see
// testDb.js), plus a `reset()` to truncate it between individual tests.
//
// jest.mock here intercepts backend/db.js -- every controller that does
// `require('../db')` transitively gets the test pool instead, so nothing
// in the test suite ever opens a connection to the app's real DATABASE_URL.
const { resetDb, closeDb } = require('./testDb');

function setupTestApp() {
  jest.mock('../../db', () => ({
    query: (...args) => require('./testDb').pool.query(...args)
  }));

  const app = require('../../server');

  // Jest gives each test file its own module registry, so each file gets
  // its own Pool -- close it when the file finishes so no idle pg
  // connections are left holding the process open.
  afterAll(closeDb);

  return {
    app,
    reset: resetDb
  };
}

module.exports = { setupTestApp };
