// Day 45: the server's own 30 s clock, for work that must happen at a set
// time rather than once a day: scheduled posts going up, "poll ended"
// notifications, (Day 55) event reminders and (Day 61) the daily stats.
// It also runs at start-up, so whatever fell due while the free-tier
// server slept happens as soon as it wakes. The daily cleanup runs the
// first three as a backstop (opening Admin > Overview counts any missing
// days itself). Several instances are safe: each job takes its
// rows with FOR UPDATE SKIP LOCKED (the daily stats: ON CONFLICT DO
// NOTHING).
const logger = require('../utils/logger');
const scheduledPostService = require('./scheduledPostService');
const pollEndService = require('./pollEndService');
const eventNotificationService = require('./eventNotificationService');
const statsService = require('./statsService');
const memoryNotificationService = require('./memoryNotificationService');

const TICK_MS = 30 * 1000;

// Each job on its own, so one failing doesn't hold up the other.
const JOBS = [
  ['scheduled posts', () => scheduledPostService.publishDue(), (r) => r.published || r.failed],
  ['ended polls', () => pollEndService.notifyEnded(), (r) => r.polls],
  // Day 55: "starts in about an hour".
  ['event reminders', () => eventNotificationService.remindDue(), (r) => r.events],
  // Day 61: count each finished day once, for Admin > Overview.
  ['daily stats', () => statsService.rollUp(), (r) => r.days],
  // Day 84: "You have memories", in each person's morning.
  ['memories', () => memoryNotificationService.notifyDue(), (r) => r.people]
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
