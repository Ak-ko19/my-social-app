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

  it('the full run has no subset and gets the Myanmar/Arabic fonts', () => {
    const full = workflow.jobs['browser-full'];
    expect(full.env.E2E_ONLY).toBeUndefined();
    expect(full.env.E2E_FONTS).toBe('1');
  });

  it('every suite file is listed in run-all.sh (none silently left out of CI)', () => {
    const helpers = new Set(['pg', 'pixel-compare', 'serve-dist', 'turnstile-stub', 'golive-smoke', 'c1-seed', 'c4-audit-checks', 'a3-visual']);
    const suites = fs.readdirSync(path.join(ROOT, 'e2e'))
      .filter((f) => f.endsWith('.cjs'))
      .map((f) => f.replace(/\.cjs$/, ''))
      .filter((name) => !helpers.has(name));
    for (const suite of suites) expect(runAll).toMatch(new RegExp(`_?SUITES="[^"]*\\b${suite}\\b`));
  });
});
