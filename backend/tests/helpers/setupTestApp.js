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
    query: (...args) => require('./testDb').pool.query(...args),
    // Day 45: a client of its own, for a transaction (db is a pg Pool).
    connect: () => require('./testDb').pool.connect()
  }));

  // Never talk to the real Cloudinary account from tests: uploads resolve
  // instantly with a fake, unique secure_url shaped like a real one
  // (numbered in upload order, so tests can assert ordering), and deletes
  // are recorded by a jest.fn (require('../../config/cloudinary') in a test
  // returns this mock). tests/setupEnv.js also blanks the credentials, so
  // media cleanup stays off unless a test turns it on.
  jest.mock('../../config/cloudinary', () => {
    let seq = 0;
    return {
      uploader: {
        upload_stream: (options, callback) => ({
          end: () => {
            seq += 1;
            const type = options.resource_type || 'image';
            const folder = options.folder || 'test';
            const ext = options.format || (type === 'video' ? 'webm' : 'jpg');
            callback(null, {
              secure_url: `https://res.cloudinary.com/test/${type}/upload/v1700000000/${folder}/img${seq}.${ext}`,
              public_id: `${folder}/img${seq}`
            });
          }
        }),
        // Day 32: forwarding copies a file from its URL (a new asset).
        upload: jest.fn(async (url, options = {}) => {
          seq += 1;
          const type = options.resource_type || 'image';
          const folder = options.folder || 'test';
          const ext = type === 'video' ? 'mp3' : 'jpg';
          return {
            secure_url: `https://res.cloudinary.com/test/${type}/upload/v1700000000/${folder}/img${seq}.${ext}`,
            public_id: `${folder}/img${seq}`
          };
        })
      },
      api: {
        delete_resources: jest.fn(async () => ({ deleted: {} }))
      }
    };
  });

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
