const { sendServerError } = require('../utils/sendError');
const {
  listSessions,
  revokeSession,
  revokeOtherSessions,
  disconnectOtherSockets,
  disconnectSession
} = require('../services/sessionService');

// GET /sessions -- where you're logged in.
async function getSessions(req, res) {
  try {
    res.json({ sessions: await listSessions(req.userId, req.sessionId) });
  } catch (err) {
    sendServerError(res, err, 'Loading your sessions failed. Please try again later.');
  }
}

// DELETE /sessions/:id -- sign out one of your devices (this one included).
async function deleteSession(req, res) {
  try {
    const sid = req.params.id;
    if (!(await revokeSession(req.userId, sid))) {
      return res.status(404).send('Session not found');
    }
    await disconnectSession(req.userId, sid);
    res.json({ current: sid === req.sessionId });
  } catch (err) {
    sendServerError(res, err, 'Signing out that device failed. Please try again later.');
  }
}

// POST /sessions/revoke-others -- "log out of all other devices". Same as
// what a password change does, minus the password change.
async function revokeOthers(req, res) {
  try {
    const revoked = await revokeOtherSessions(req.userId, req.sessionId);
    await disconnectOtherSockets(req.userId, req.sessionId);
    res.json({ revoked });
  } catch (err) {
    sendServerError(res, err, 'Signing out your other devices failed. Please try again later.');
  }
}

// POST /logout -- this device's session ends on the server too, not just
// in the browser. A token from before sessions has nothing to end.
async function logout(req, res) {
  try {
    if (req.sessionId) {
      await revokeSession(req.userId, req.sessionId);
      await disconnectSession(req.userId, req.sessionId);
    }
    res.json({ ok: true });
  } catch (err) {
    sendServerError(res, err, 'Logout failed. Please try again later.');
  }
}

module.exports = { getSessions, deleteSession, revokeOthers, logout };
