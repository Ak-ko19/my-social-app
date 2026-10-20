const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Day 13: the browser suites run in CI (.github/workflows/ci.yml). Nothing
// here can watch GitHub run it, so this checks the workflow against the
// scripts it drives: a renamed suite or a changed port would otherwise
// only show up as a red (or, worse, an empty green) run on GitHub.
const ROOT = path.join(__dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const workflow = yaml.load(read('.github/workflows/ci.yml'));
const runAll = read('e2e/run-all.sh');
const e2eUp = read('e2e/e2e-up.sh');

describe('CI browser jobs', () => {
  const jobs = ['browser-smoke', 'browser-full'].map((name) => [name, workflow.jobs[name]]);

  it('both exist, and the full run can be started by hand', () => {
    for (const [name, job] of jobs) expect(job).toBeDefined();
    expect(Object.keys(workflow.on)).toContain('workflow_dispatch');
    expect(workflow.jobs['browser-full'].if).toMatch(/workflow_dispatch/);
    expect(workflow.jobs['browser-full'].if).toMatch(/base_ref == 'master'/);
  });

  it.each(jobs)('%s: Postgres where the e2e scripts expect it', (name, job) => {
    const pg = job.services.postgres;
    expect(pg.image).toBe('postgres:17');
    expect(pg.ports).toEqual(['55433:5432']);
    expect(pg.env.POSTGRES_USER).toBe('testuser');
    expect(e2eUp).toContain('-p 55433 -U testuser');
    expect(job.env.E2E_EXTERNAL_DB).toBe('1');
  });

  it.each(jobs)('%s: installs all three packages and runs run-all.sh', (name, job) => {
    const install = job.steps.find((s) => s.name === 'Install dependencies').run;
    for (const dir of ['backend', 'frontend', 'e2e']) expect(install).toContain(`cd ${dir} && npm ci`);
    const run = job.steps.find((s) => s.name === 'Run browser suites');
    expect(run['working-directory']).toBe('e2e');
    expect(run.run).toBe('bash run-all.sh');
  });

  it('the smoke subset names real suites that run-all.sh knows', () => {
    const only = workflow.jobs['browser-smoke'].env.E2E_ONLY.split(/\s+/).filter(Boolean);
    expect(only.length).toBeGreaterThanOrEqual(3);
    for (const suite of only) {
      expect(fs.existsSync(path.join(ROOT, 'e2e', `${suite}.cjs`))).toBe(true);
      expect(runAll).toMatch(new RegExp(`_?SUITES="[^"]*\\b${suite}\\b`));
    }
  });

  it('the frontend job runs the component tests (Vitest) that package.json defines', () => {
    const runs = workflow.jobs.frontend.steps.map((s) => s.run).filter(Boolean);
    expect(runs).toContain('npm test');
    expect(JSON.parse(read('frontend/package.json')).scripts.test).toBe('vitest run');
  });

  it('the full run has no subset and gets the Noto (Arabic) fonts', () => {
    const full = workflow.jobs['browser-full'];
    expect(full.env.E2E_ONLY).toBeUndefined();
    expect(full.env.E2E_FONTS).toBe('1');
  });

  it('every suite file is listed in run-all.sh (none silently left out of CI)', () => {
    const helpers = new Set(['pg', 'pixel-compare', 'serve-dist', 'turnstile-stub', 'link-stub', 'push-stub', 'golive-smoke', 'c1-seed', 'c4-audit-checks', 'a3-visual', 'legal-dates', 'journey-kit', 'cloudinary-stub']);
    const suites = fs.readdirSync(path.join(ROOT, 'e2e'))
      .filter((f) => f.endsWith('.cjs'))
      .map((f) => f.replace(/\.cjs$/, ''))
      .filter((name) => !helpers.has(name));
    for (const suite of suites) expect(runAll).toMatch(new RegExp(`_?SUITES="[^"]*\\b${suite}\\b`));
  });
});

// Day 71: e2e/README.md names every suite and helper file (its table fell
// behind once, from Day 5 to Day 66).
describe('e2e/README.md', () => {
  it('lists every .cjs file in e2e/', () => {
    const readme = read('e2e/README.md');
    const files = fs.readdirSync(path.join(ROOT, 'e2e')).filter((f) => f.endsWith('.cjs')).map((f) => f.replace(/\.cjs$/, ''));
    expect(files.filter((name) => !readme.includes(`\`${name}\``))).toEqual([]);
  });
});

// Days 64–66: the 15 user journeys (e2e/JOURNEYS.md) all run in CI, and
// each one the doc lists really has checks in the suite it names.
describe('user journeys', () => {
  const rows = [...read('e2e/JOURNEYS.md').matchAll(/^\| (J\d+) \| [^|]+ \| `([\w-]+)` \|/gm)].map((m) => [m[1], m[2]]);

  it('JOURNEYS.md lists J1..J15, in order', () => {
    expect(rows.map(([id]) => id)).toEqual(Array.from({ length: 15 }, (_, i) => `J${i + 1}`));
  });

  it.each(rows)('%s has checks in %s', (id, suite) => {
    expect(read(`e2e/${suite}.cjs`)).toMatch(new RegExp(`check\\(['"\`]${id} `));
  });

  it('every journey suite runs in the full CI job, and the core one on every push', () => {
    const suites = fs.readdirSync(path.join(ROOT, 'e2e')).filter((f) => /^journeys-.*\.cjs$/.test(f)).map((f) => f.replace(/\.cjs$/, ''));
    expect(suites.sort()).toEqual([...new Set(rows.map(([, suite]) => suite))].sort());
    for (const suite of suites) expect(runAll).toMatch(new RegExp(`_?SUITES="[^"]*\\b${suite}\\b`));
    expect(workflow.jobs['browser-smoke'].env.E2E_ONLY.split(/\s+/)).toContain('journeys-core');
  });
});

// Day 66 (AUDIT_REPORT_3 A3): the two longest suites run in short parts.
// Together the parts must still be the whole suite.
describe('split browser suites', () => {
  const list = (name) => (runAll.match(new RegExp(`^${name}="([^"]*)"`, 'm')) || [])[1]?.split(/\s+/).filter(Boolean);
  const a11y = read('e2e/day26-a11y.cjs');
  const a3 = read('e2e/a3-visual.cjs');

  it('day26-a11y: light, dark and ar, each passed to the suite, which runs all of them when unset', () => {
    expect(list('A11Y_PARTS')).toEqual(['light', 'dark', 'ar']);
    expect(runAll).toContain('A11Y_PART=$part node "$s.cjs"');
    expect(a11y).toContain("const PARTS = process.env.A11Y_PART ? [process.env.A11Y_PART] : ['light', 'dark', 'ar'];");
  });

  it('a3: every language x theme, each passed to the suite, which runs both themes when unset', () => {
    expect(list('A3_PARTS')).toEqual(['en-light', 'en-dark', 'ar-light', 'ar-dark']);
    expect(runAll).toContain('A3_LANG=${part%-*} A3_THEME=${part#*-} node a3-visual.cjs');
    expect(a3).toContain("const THEMES = process.env.A3_THEME ? [process.env.A3_THEME] : ['light', 'dark'];");
    expect(a3).toContain("const LANG = process.env.A3_LANG || 'en';");
  });
});

// Day 60 (AUDIT_REPORT_3 A1): known advisories in production dependencies
// fail CI, in every package that has a lockfile.
describe('CI dependency audit', () => {
  it('audits the production dependencies of backend, frontend and e2e', () => {
    const job = workflow.jobs['dependency-audit'];
    expect(job).toBeDefined();
    expect(job.strategy.matrix.dir).toEqual(['backend', 'frontend', 'e2e']);
    expect(job.defaults.run['working-directory']).toBe('${{ matrix.dir }}');
    expect(job.steps.map((s) => s.run)).toContain('npm audit --omit=dev --audit-level=high');
    for (const dir of job.strategy.matrix.dir) expect(fs.existsSync(path.join(ROOT, dir, 'package-lock.json'))).toBe(true);
  });
});
