// Day 45: the server's own 30 s clock, for work that must happen at a set
// time rather than once a day: scheduled posts going up, and "poll ended"
// notifications. It also runs at start-up, so whatever fell due while the
// free-tier server slept happens as soon as it wakes. The daily cleanup
// runs the same jobs as a backstop. Several instances are safe: each job
// takes its rows with FOR UPDATE SKIP LOCKED.
const logger = require('../utils/logger');
const scheduledPostService = require('./scheduledPostService');
const pollEndService = require('./pollEndService');

const TICK_MS = 30 * 1000;

// Each job on its own, so one failing doesn't hold up the other.
const JOBS = [
  ['scheduled posts', () => scheduledPostService.publishDue(), (r) => r.published || r.failed],
  ['ended polls', () => pollEndService.notifyEnded(), (r) => r.polls]
];

let timer = null;
let running = false;

// One pass at a time: a tick while one is running does nothing.
async function tick() {
  if (running) return;
  running = true;
  try {
    for (const [name, run, didWork] of JOBS) {
      try {
        const result = await run();
        if (didWork(result)) logger.info(name, result);
      } catch (err) {
        logger.error(`${name} failed`, { err });
      }
    }
  } finally {
    running = false;
  }
}

function start({ intervalMs = TICK_MS } = {}) {
  if (timer) return;
  tick();
  timer = setInterval(tick, intervalMs);
  timer.unref(); // never keeps the process alive on its own
}

function stop() {
  clearInterval(timer);
  timer = null;
}

module.exports = { tick, start, stop, TICK_MS };
