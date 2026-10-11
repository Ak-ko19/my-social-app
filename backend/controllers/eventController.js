// Day 55: events (Facebook's, basic). A host, a time, a place, details and
// an audience; people answer Going or Interested. Who can see an event
// follows the post rules: a deactivated host's events are hidden, a block
// either way hides them, and a "followers" event is for the host's
// accepted followers. Hidden -> 404, so a link never confirms it exists.
const db = require('../db');
const { sendServerError } = require('../utils/sendError');
const { getPagination } = require('../utils/pagination');
const { toUnicode } = require('../utils/myanmarText');

const AUDIENCES = ['public', 'followers'];
const RESPONSES = ['going', 'interested'];
const MAX_NAME = 100;
const MAX_DESCRIPTION = 2000;
const MAX_LOCATION = 200;
const MAX_AHEAD_DAYS = 366;
const MAX_LENGTH_DAYS = 31;
const DAY_MS = 24 * 60 * 60 * 1000;

class EventError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const handle = (res, err, fallback) =>
  err instanceof EventError ? res.status(err.status).send(err.message) : sendServerError(res, err, fallback);

// "Viewer <v> may see event alias e, hosted by user alias u."
const eventVisibleSql = (v) => `(
  e.host_id = ${v} OR (
    NOT u.is_deactivated
    AND (${v}::int IS NULL OR NOT EXISTS (SELECT 1 FROM blocks b
      WHERE (b.blocker_id = ${v} AND b.blocked_id = e.host_id) OR (b.blocker_id = e.host_id AND b.blocked_id = ${v})))
    AND (e.audience = 'public' OR (${v}::int IS NOT NULL AND EXISTS (SELECT 1 FROM follows f
      WHERE f.follower_id = ${v} AND f.following_id = e.host_id AND f.status = 'accepted')))
  ))`;

// An event has ended once its end (or, without one, its start) has passed.
const ENDED_SQL = 'COALESCE(e.ends_at, e.starts_at) < now()';

const EVENT_COLUMNS = (v) => `e.id, e.name, e.description, e.starts_at, e.ends_at, e.location, e.audience,
  e.cancelled_at, e.created_at, ${ENDED_SQL} AS has_ended,
  u.id AS host_id, u.username AS host_username, u.avatar_url AS host_avatar_url,
  (SELECT COUNT(*)::int FROM event_responses r WHERE r.event_id = e.id AND r.status = 'going') AS going_count,
  (SELECT COUNT(*)::int FROM event_responses r WHERE r.event_id = e.id AND r.status = 'interested') AS interested_count,
  (SELECT r.status FROM event_responses r WHERE r.event_id = e.id AND r.user_id = ${v}) AS my_response,
  COALESCE(e.host_id = ${v}, false) AS is_host`;

function parseTime(raw) {
  const time = typeof raw === 'string' && raw.trim() ? new Date(raw) : new Date(NaN);
  if (Number.isNaN(time.getTime())) throw new EventError(400, 'Enter a valid date and time');
  return time;
}

// The event's fields from a request. `current` (editing) fills in what
// isn't sent; a new or moved start must be in the future.
function readFields(body, current = null) {
  const out = {};
  if (!current || body.name !== undefined) {
    const name = typeof body.name === 'string' ? toUnicode(body.name).trim() : '';
    if (!name) throw new EventError(400, 'An event needs a name');
    if ([...name].length > MAX_NAME) throw new EventError(400, 'Event name must be 100 characters or fewer');
    out.name = name;
  }
  if (!current || body.description !== undefined) {
    const description = typeof body.description === 'string' ? toUnicode(body.description).trim() : '';
    if ([...description].length > MAX_DESCRIPTION) throw new EventError(400, 'Details must be 2000 characters or fewer');
    out.description = description || null;
  }
  if (!current || body.location !== undefined) {
    const location = typeof body.location === 'string' ? toUnicode(body.location).trim() : '';
    if ([...location].length > MAX_LOCATION) throw new EventError(400, 'Location must be 200 characters or fewer');
    out.location = location || null;
  }
  if (!current || body.audience !== undefined) {
    const audience = body.audience === undefined ? 'public' : body.audience;
    if (!AUDIENCES.includes(audience)) throw new EventError(400, `audience must be one of: ${AUDIENCES.join(', ')}`);
    out.audience = audience;
  }
  if (!current || body.startsAt !== undefined) {
    if (body.startsAt === undefined || body.startsAt === null || body.startsAt === '') throw new EventError(400, 'Choose when the event starts');
    const startsAt = parseTime(body.startsAt);
    if (startsAt.getTime() <= Date.now()) throw new EventError(400, 'The event must start in the future');
    if (startsAt.getTime() > Date.now() + MAX_AHEAD_DAYS * DAY_MS) throw new EventError(400, 'The event must start within a year');
    out.starts_at = startsAt;
  }
  if (!current || body.endsAt !== undefined) {
    out.ends_at = body.endsAt === null || body.endsAt === '' || body.endsAt === undefined ? null : parseTime(body.endsAt);
  }
  const start = out.starts_at || current.starts_at;
  const end = out.ends_at !== undefined ? out.ends_at : current.ends_at;
  if (end) {
    if (end.getTime() <= start.getTime()) throw new EventError(400, 'The event must end after it starts');
    if (end.getTime() - start.getTime() > MAX_LENGTH_DAYS * DAY_MS) throw new EventError(400, 'An event can last at most 31 days');
  }
  return out;
}

async function loadEvent(eventId, viewerId) {
  if (!Number.isInteger(eventId)) throw new EventError(400, 'Invalid event ID');
  const result = await db.query(
    `SELECT ${EVENT_COLUMNS('$2')}
     FROM events e JOIN users u ON u.id = e.host_id
     WHERE e.id = $1 AND ${eventVisibleSql('$2')}`,
    [eventId, viewerId ?? null]
  );
  if (!result.rows[0]) throw new EventError(404, 'Event not found');
  return result.rows[0];
}

async function loadHostedEvent(eventId, viewerId) {
  const event = await loadEvent(eventId, viewerId);
  if (!event.is_host) throw new EventError(403, 'Only the host can do that');
  return event;
}

// POST /events { name, startsAt, endsAt?, location?, description?, audience? }
async function createEvent(req, res) {
  try {
    const f = readFields(req.body || {});
    const result = await db.query(
      `INSERT INTO events (host_id, name, description, starts_at, ends_at, location, audience)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [req.userId, f.name, f.description, f.starts_at, f.ends_at, f.location, f.audience]
    );
    res.status(201).json(await loadEvent(result.rows[0].id, req.userId));
  } catch (err) {
    handle(res, err, 'Creating the event failed. Please try again later.');
  }
}

// GET /events/:id
async function getEvent(req, res) {
  try {
    res.json(await loadEvent(Number(req.params.id), req.userId));
  } catch (err) {
    handle(res, err, 'Loading the event failed. Please try again later.');
  }
}

// PATCH /events/:id -- the host. A new start time re-arms the reminder.
async function updateEvent(req, res) {
  try {
    const event = await loadHostedEvent(Number(req.params.id), req.userId);
    if (event.cancelled_at) throw new EventError(400, 'This event was cancelled');
    if (event.has_ended) throw new EventError(400, 'This event has ended');
    const f = readFields(req.body || {}, event);
    const keys = Object.keys(f);
    if (keys.length === 0) throw new EventError(400, 'Nothing to update');
    const sets = keys.map((k, i) => `${k} = $${i + 2}`);
    if (f.starts_at) sets.push('reminder_sent_at = NULL');
    await db.query(`UPDATE events SET ${sets.join(', ')} WHERE id = $1`, [event.id, ...keys.map((k) => f[k])]);
    res.json(await loadEvent(event.id, req.userId));
  } catch (err) {
    handle(res, err, 'Saving the event failed. Please try again later.');
  }
}

// POST /events/:id/cancel -- the host. The event stays, marked cancelled.
async function cancelEvent(req, res) {
  try {
    const event = await loadHostedEvent(Number(req.params.id), req.userId);
    if (event.has_ended) throw new EventError(400, 'This event has ended');
    await db.query('UPDATE events SET cancelled_at = COALESCE(cancelled_at, now()) WHERE id = $1', [event.id]);
    res.json(await loadEvent(event.id, req.userId));
  } catch (err) {
    handle(res, err, 'Cancelling the event failed. Please try again later.');
  }
}

// DELETE /events/:id -- the host; gone for everyone.
async function deleteEvent(req, res) {
  try {
    const event = await loadHostedEvent(Number(req.params.id), req.userId);
    await db.query('DELETE FROM events WHERE id = $1', [event.id]);
    res.json({ deleted: true });
  } catch (err) {
    handle(res, err, 'Deleting the event failed. Please try again later.');
  }
}

// PUT /events/:id/response { status: going | interested }
async function respond(req, res) {
  try {
    const event = await loadEvent(Number(req.params.id), req.userId);
    const status = req.body?.status;
    if (!RESPONSES.includes(status)) throw new EventError(400, `status must be one of: ${RESPONSES.join(', ')}`);
    if (event.is_host) throw new EventError(400, "You're hosting this event");
    if (event.cancelled_at) throw new EventError(400, 'This event was cancelled');
    if (event.has_ended) throw new EventError(400, 'This event has ended');
    await db.query(
      `INSERT INTO event_responses (event_id, user_id, status) VALUES ($1, $2, $3)
       ON CONFLICT (event_id, user_id) DO UPDATE SET status = EXCLUDED.status, created_at = now()`,
      [event.id, req.userId, status]
    );
    res.json(await loadEvent(event.id, req.userId));
  } catch (err) {
    handle(res, err, 'Saving your answer failed. Please try again later.');
  }
}

// DELETE /events/:id/response -- taking it back always works (even on a
// cancelled or finished event, or one you can no longer see).
async function removeResponse(req, res) {
  try {
    const eventId = Number(req.params.id);
    if (!Number.isInteger(eventId)) throw new EventError(400, 'Invalid event ID');
    await db.query('DELETE FROM event_responses WHERE event_id = $1 AND user_id = $2', [eventId, req.userId]);
    const visible = await loadEvent(eventId, req.userId).catch((err) => {
      if (err instanceof EventError && err.status === 404) return null;
      throw err;
    });
    res.json(visible || { id: eventId, my_response: null });
  } catch (err) {
    handle(res, err, 'Saving your answer failed. Please try again later.');
  }
}

// GET /events/:id/guests?status=going|interested -- newest answers first,
// without anyone the viewer has a block with.
async function listGuests(req, res) {
  try {
    const event = await loadEvent(Number(req.params.id), req.userId);
    const status = req.query.status === undefined ? 'going' : req.query.status;
    if (!RESPONSES.includes(status)) throw new EventError(400, `status must be one of: ${RESPONSES.join(', ')}`);
    const { page, limit, offset } = getPagination(req, { defaultLimit: 20, maxLimit: 50 });
    const result = await db.query(
      `SELECT u.id, u.username, u.avatar_url, r.created_at AS answered_at
       FROM event_responses r JOIN users u ON u.id = r.user_id
       WHERE r.event_id = $1 AND r.status = $2 AND NOT u.is_deactivated
         AND ($5::int IS NULL OR NOT EXISTS (SELECT 1 FROM blocks b
           WHERE (b.blocker_id = $5 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $5)))
       ORDER BY r.created_at DESC, u.id DESC
       LIMIT $3 OFFSET $4`,
      [event.id, status, limit + 1, offset, req.userId ?? null]
    );
    const hasMore = result.rows.length > limit;
    res.json({ guests: hasMore ? result.rows.slice(0, limit) : result.rows, page, hasMore });
  } catch (err) {
    handle(res, err, 'Loading the guests failed. Please try again later.');
  }
}

// GET /events?section=mine|discover -- events that haven't ended.
// mine: you host or answered, soonest first (cancelled ones too, marked);
// discover: others you can see and haven't answered, not cancelled,
// soonest first. Paged: { events, page, hasMore }.
async function listEvents(req, res) {
  try {
    const section = req.query.section === undefined ? 'mine' : req.query.section;
    if (!['mine', 'discover'].includes(section)) throw new EventError(400, 'section must be mine or discover');
    const { page, limit, offset } = getPagination(req, { defaultLimit: 20, maxLimit: 50 });
    const mineSql = `(e.host_id = $1 OR EXISTS (SELECT 1 FROM event_responses r WHERE r.event_id = e.id AND r.user_id = $1))`;
    const result = await db.query(
      `SELECT ${EVENT_COLUMNS('$1')}
       FROM events e JOIN users u ON u.id = e.host_id
       WHERE NOT ${ENDED_SQL} AND ${eventVisibleSql('$1')}
         AND ${section === 'mine' ? mineSql : `NOT ${mineSql} AND e.cancelled_at IS NULL`}
       ORDER BY e.starts_at ASC, e.id ASC
       LIMIT $2 OFFSET $3`,
      [req.userId, limit + 1, offset]
    );
    const hasMore = result.rows.length > limit;
    res.json({ events: hasMore ? result.rows.slice(0, limit) : result.rows, page, hasMore });
  } catch (err) {
    handle(res, err, 'Loading events failed. Please try again later.');
  }
}

module.exports = {
  createEvent, getEvent, updateEvent, cancelEvent, deleteEvent, respond, removeResponse, listGuests, listEvents,
  AUDIENCES, RESPONSES
};
