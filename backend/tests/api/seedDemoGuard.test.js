const { assertLocalDatabase } = require('../../scripts/seed-demo');

// C1: the demo seed must never run against a remote (e.g. production) database.
describe('seed-demo safety guard', () => {
  const env = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = env;
  });

  it('allows local databases', () => {
    for (const url of ['postgresql://u@localhost:5432/db', 'postgres://u:p@127.0.0.1/db', 'postgresql://u@[::1]:5432/db']) {
      expect(() => assertLocalDatabase(url)).not.toThrow();
    }
  });

  it('refuses remote hosts, missing/invalid URLs and production', () => {
    expect(() => assertLocalDatabase('postgresql://u:p@db.example-cloud.com:5432/prod')).toThrow(/not local/);
    expect(() => assertLocalDatabase('postgresql://u@localhost.evil.com/db')).toThrow(/not local/);
    expect(() => assertLocalDatabase(undefined)).toThrow(/not set/);
    expect(() => assertLocalDatabase('not a url')).toThrow(/valid URL/);
    process.env.NODE_ENV = 'production';
    expect(() => assertLocalDatabase('postgresql://u@localhost/db')).toThrow(/production/);
  });
});
