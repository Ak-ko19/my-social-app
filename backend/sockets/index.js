const { Server } = require('socket.io');
const db = require('../db');
const allowedOrigins = require('../config/allowedOrigins');
const socketAuthMiddleware = require('./socketAuth');
const messageService = require('../services/messageService');
const presence = require('./presence');

// message_error's code lets the frontend tell "edit and resend" (validation),
// "can't be sent here" (not a participant) apart from "retry the same send"
// (transient server/DB failure).
function errorCodeFor(err) {
  if (err instanceof messageService.MessageValidationError) return 'VALIDATION';
  if (err instanceof messageService.NotParticipantError) return 'FORBIDDEN';
  return 'SERVER_ERROR';
}

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

    // messageService.sendMessage is the single place a message actually gets
    // written (validated, sanitized, persisted with status='sent') -- the
    // REST fallback (conversationController.sendMessage) calls the exact
    // same function, so the two transports can never diverge.
    socket.on('send_message', async (payload) => {
      const clientTempId = payload?.clientTempId;
      try {
        const message = await messageService.sendMessage({
          conversationId: payload?.conversationId,
          senderId: socket.userId,
          content: payload?.content,
          clientTempId
        });

        // Persist-then-broadcast: the row above is already committed with
        // its real DB id before this ever fires. Broadcasts to the whole
        // room, including the sender's own other connected devices/tabs --
        // they're already joined to conv_<id> since they're a participant.
        io.to(`conv_${message.conversation_id}`).emit('new_message', message);

        // Sent to the sending socket specifically (not the room) so it can
        // reconcile the one optimistic message it's tracking by clientTempId.
        socket.emit('message_ack', { clientTempId, message });
      } catch (err) {
        if (errorCodeFor(err) === 'SERVER_ERROR') {
          console.error(`send_message failed for user ${socket.userId}:`, err.message);
        }
        socket.emit('message_error', { clientTempId, error: err.message, code: errorCodeFor(err) });
      }
    });

    // Fired by a recipient's client the moment it actually receives a
    // new_message event while actively connected -- flips sent -> delivered.
    socket.on('mark_delivered', async (payload) => {
      try {
        const updated = await messageService.markDelivered({
          conversationId: payload?.conversationId,
          userId: socket.userId,
          messageId: payload?.messageId
        });
        if (updated) {
          io.to(`conv_${updated.conversation_id}`).emit('message_status_update', {
            conversationId: updated.conversation_id,
            messageIds: [updated.id],
            status: 'delivered'
          });
        }
      } catch (err) {
        if (errorCodeFor(err) === 'SERVER_ERROR') {
          console.error(`mark_delivered failed for user ${socket.userId}:`, err.message);
        }
        socket.emit('message_error', { error: err.message, code: errorCodeFor(err) });
      }
    });

    // Fired when the recipient opens/views the conversation. messageId is
    // optional -- omitting it means "mark everything up to the latest
    // message read", matching PUT /conversations/:id/read's behavior.
    socket.on('mark_read', async (payload) => {
      try {
        const conversationId = payload?.conversationId;
        const result = await messageService.markRead({
          conversationId,
          userId: socket.userId,
          upToMessageId: payload?.messageId
        });
        if (result.lastReadMessageId !== null) {
          io.to(`conv_${conversationId}`).emit('message_status_update', {
            conversationId,
            messageIds: result.updatedMessageIds,
            lastReadMessageId: result.lastReadMessageId,
            readerId: socket.userId,
            status: 'read'
          });
        }
      } catch (err) {
        if (errorCodeFor(err) === 'SERVER_ERROR') {
          console.error(`mark_read failed for user ${socket.userId}:`, err.message);
        }
        socket.emit('message_error', { error: err.message, code: errorCodeFor(err) });
      }
    });

    // Broadcasts to everyone else in the conversation (not the sender's own
    // other devices -- socket.to() excludes the emitting socket, unlike the
    // io.to() used for new_message above). No corresponding "stopped
    // typing" event exists on purpose -- the frontend clears its own
    // indicator on a client-side timeout instead (see
    // hooks/useTypingIndicator.js), so the server never needs to track or
    // broadcast when typing stops.
    socket.on('typing', async (payload) => {
      try {
        const conversationId = parseInt(payload?.conversationId, 10);
        if (isNaN(conversationId)) return;
        // Same rule as every write in this file: room membership alone is
        // never trusted as authorization.
        if (!(await messageService.isParticipant(conversationId, socket.userId))) return;
        socket.to(`conv_${conversationId}`).emit('user_typing', { conversationId, userId: socket.userId });
      } catch (err) {
        console.error(`typing event failed for user ${socket.userId}:`, err.message);
      }
    });

    // conversationRoomIds is filled in by the room-join below and read by
    // the disconnect handler, so a user_offline broadcast can reach the
    // same rooms user_online was announced to -- socket.rooms can't be
    // relied on for this by the time 'disconnect' fires (socket.io has
    // already left the socket from every room before that event runs).
    let conversationRoomIds = [];

    socket.on('disconnect', async (reason) => {
      console.log(`Socket disconnected: userId=${socket.userId} reason=${reason}`);
      try {
        await db.query('UPDATE users SET last_seen = NOW() WHERE id = $1', [socket.userId]);
      } catch (err) {
        console.error(`Failed to update last_seen for user ${socket.userId}:`, err.message);
      }

      // Only announce offline once this was the user's LAST connected
      // socket (they may still have another tab/device open).
      if (presence.markOffline(socket.userId, socket.id)) {
        conversationRoomIds.forEach((conversationId) => {
          io.to(`conv_${conversationId}`).emit('user_offline', { userId: socket.userId });
        });
      }
    });

    (async () => {
      // Tracked immediately (not inside the try below) so presence doesn't
      // depend on the room-lookup query succeeding.
      const isFirstConnection = presence.markOnline(socket.userId, socket.id);

      try {
        const { rows } = await db.query(
          'SELECT conversation_id FROM conversation_participants WHERE user_id = $1',
          [socket.userId]
        );
        conversationRoomIds = rows.map((row) => row.conversation_id);
        conversationRoomIds.forEach((conversationId) => socket.join(`conv_${conversationId}`));

        // Scoped to this user's own conversation rooms rather than a global
        // broadcast -- only people who actually share a conversation with
        // them have any reason to know they came online. socket.to() (not
        // io.to()) so this socket doesn't hear its own "you're online" echo.
        if (isFirstConnection) {
          conversationRoomIds.forEach((conversationId) => {
            socket.to(`conv_${conversationId}`).emit('user_online', { userId: socket.userId });
          });
        }
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
