const { Server } = require('socket.io');
const db = require('../db');
const allowedOrigins = require('../config/allowedOrigins');
const socketAuthMiddleware = require('./socketAuth');
const {
  insertMessage,
  isParticipant,
  MAX_MESSAGE_LENGTH,
  MAX_CLIENT_TEMP_ID_LENGTH
} = require('../controllers/conversationController');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
    },
    // Render's free tier is a shared, occasionally slow network path (and can
    // be waking up from spin-down), so a default 20s pingTimeout is prone to
    // false disconnects on ordinary latency spikes. 60s gives real latency
    // room to recover while still reaping a genuinely dead connection within
    // a minute. Note this only smooths out transient latency on an
    // already-warm server -- it can't keep the process itself from spinning
    // down after 15 minutes of no traffic; that needs an external keep-alive
    // ping (e.g. a cron hitting the REST API) or a paid Render plan.
    pingInterval: 25000,
    pingTimeout: 60000,
  });

  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    // Listeners are attached synchronously, before the async room-join below
    // ever awaits -- a client that emits send_message right after 'connect'
    // must not have that event silently dropped while the join is still
    // in flight. isParticipant() inside the handler enforces membership
    // independently of whether the room-join query has completed yet.

    // Same validation + persistence as POST /conversations/:id/messages
    // (conversationController.sendMessage) -- insertMessage() is the single
    // place a message actually gets written, so both transports stay
    // identical. ack is an optional callback (socket.emit(event, payload, ack))
    // the client can use to confirm the send or surface an error immediately,
    // separately from the 'new_message' broadcast below.
    socket.on('send_message', async (payload, ack) => {
      const respond = typeof ack === 'function' ? ack : () => {};
      try {
        const conversationId = parseInt(payload?.conversationId);
        if (isNaN(conversationId)) {
          return respond({ error: 'Invalid conversation ID' });
        }

        const content = (payload?.content || '').trim();
        if (!content) {
          return respond({ error: 'Message content cannot be empty' });
        }
        if (content.length > MAX_MESSAGE_LENGTH) {
          return respond({ error: `Message content must be under ${MAX_MESSAGE_LENGTH} characters` });
        }

        const clientTempId = payload?.clientTempId;
        if (clientTempId !== undefined && clientTempId !== null) {
          if (typeof clientTempId !== 'string' || clientTempId.length > MAX_CLIENT_TEMP_ID_LENGTH) {
            return respond({ error: `clientTempId must be a string under ${MAX_CLIENT_TEMP_ID_LENGTH} characters` });
          }
        }

        if (!(await isParticipant(conversationId, socket.userId))) {
          return respond({ error: 'You are not a participant in this conversation' });
        }

        const message = await insertMessage({
          conversationId,
          senderId: socket.userId,
          content,
          clientTempId
        });

        // Broadcasts to the whole room, including the sender's own other
        // connected devices/tabs -- they were joined to conv_<id> on connect
        // since they're a participant, so this also drives their
        // optimistic-UI reconciliation via the echoed client_temp_id.
        io.to(`conv_${conversationId}`).emit('new_message', message);
        respond({ message });
      } catch (err) {
        console.error(`send_message failed for user ${socket.userId}:`, err.message);
        respond({ error: 'Send message failed. Please try again later.' });
      }
    });

    socket.on('disconnect', async (reason) => {
      console.log(`Socket disconnected: userId=${socket.userId} reason=${reason}`);
      try {
        await db.query('UPDATE users SET last_seen = NOW() WHERE id = $1', [socket.userId]);
      } catch (err) {
        console.error(`Failed to update last_seen for user ${socket.userId}:`, err.message);
      }
    });

    (async () => {
      try {
        const { rows } = await db.query(
          'SELECT conversation_id FROM conversation_participants WHERE user_id = $1',
          [socket.userId]
        );
        rows.forEach((row) => socket.join(`conv_${row.conversation_id}`));
      } catch (err) {
        console.error(`Failed to join conversation rooms for user ${socket.userId}:`, err.message);
      }
    })();
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.io has not been initialized yet -- call initSocket(server) first.');
  }
  return io;
}

module.exports = { initSocket, getIO };
