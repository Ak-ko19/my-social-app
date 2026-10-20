const { Server } = require('socket.io');
const db = require('../db');
const allowedOrigins = require('../config/allowedOrigins');
const socketAuthMiddleware = require('./socketAuth');
const messageService = require('../services/messageService');
const { HttpError } = require('../utils/httpError');
const presence = require('./presence');
const { report } = require('../services/errorLogService');
const logger = require('../utils/logger');

// A socket handler hit a real server error (not a validation error): log
// it and record it in the error log (Day 10), grouped by event name.
function socketFailure(event, socket, err) {
  logger.error('socket handler failed', { event, userId: socket.userId, err });
  report(err, { source: 'socket', route: event, userId: socket.userId });
}

// message_error's code lets the frontend tell "edit and resend" (validation),
// "can't be sent here" (not a participant) apart from "retry the same send"
// (transient server/DB failure).
// Day 69: read from the error's HTTP status, the same one REST answers with.
const CODE_FOR_STATUS = { 400: 'VALIDATION', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 429: 'RATE_LIMITED' };
function errorCodeFor(err) {
  return (err instanceof HttpError && CODE_FOR_STATUS[err.status]) || 'SERVER_ERROR';
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
    // B10: a personal room, joined synchronously (before any await), so
    // group membership changes can move this user's live sockets into/out
    // of a conversation room via io.in(`user_<id>`).socketsJoin/socketsLeave
    // without a reconnect.
    socket.join(`user_${socket.userId}`);

    // Listeners are attached synchronously, before the async room-join below
    // ever awaits -- a client that emits send_message right after 'connect'
    // must not have that event silently dropped while the join is still
    // in flight. isParticipant() inside the handler enforces membership
    // independently of whether the room-join query has completed yet.

    // messageService.sendMessage is the single place a message actually gets
    // written (validated, persisted with status='sent') -- the
    // REST fallback (conversationController.sendMessage) calls the exact
    // same function, so the two transports can never diverge.
    socket.on('send_message', async (payload) => {
      const clientTempId = payload?.clientTempId;
      try {
        const message = await messageService.sendMessage({
          conversationId: payload?.conversationId,
          senderId: socket.userId,
          content: payload?.content,
          clientTempId,
          replyToMessageId: payload?.replyToMessageId
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
          socketFailure('send_message', socket, err);
        }
        socket.emit('message_error', { clientTempId, error: err.message, code: errorCodeFor(err) });
      }
    });

    // Same shared-service pattern as send_message: messageService.deleteMessage
    // is the single place a message actually gets soft-deleted (ownership
    // check + deleted_at write), so this and the REST fallback
    // (conversationController.deleteMessage) can never diverge. No separate
    // ack event -- the messageId is already known client-side (unlike a new
    // send, nothing needs reconciling by clientTempId), so the room
    // broadcast below doubles as the deleting client's own confirmation,
    // and message_error (with messageId) covers the failure case.
    socket.on('delete_message', async (payload) => {
      const messageId = payload?.messageId;
      try {
        const message = await messageService.deleteMessage({
          conversationId: payload?.conversationId,
          messageId,
          userId: socket.userId
        });

        // io.to (not socket.to), same reasoning as new_message: the
        // deleting user's own other connected devices/tabs must also see
        // the delete, not just other participants.
        io.to(`conv_${message.conversation_id}`).emit('message_deleted', {
          conversationId: message.conversation_id,
          messageId: message.id,
          deletedAt: message.deleted_at
        });
      } catch (err) {
        if (errorCodeFor(err) === 'SERVER_ERROR') {
          socketFailure('delete_message', socket, err);
        }
        socket.emit('message_error', { messageId, error: err.message, code: errorCodeFor(err) });
      }
    });

    // B9: edit your own recent text message. Same shared-service pattern as
    // delete_message; the room broadcast doubles as the editor's own
    // confirmation, message_error (with messageId) covers failure.
    socket.on('edit_message', async (payload) => {
      const messageId = payload?.messageId;
      try {
        const message = await messageService.editMessage({
          conversationId: payload?.conversationId,
          messageId,
          userId: socket.userId,
          content: payload?.content
        });
        io.to(`conv_${message.conversation_id}`).emit('message_edited', { conversationId: message.conversation_id, message });
      } catch (err) {
        if (errorCodeFor(err) === 'SERVER_ERROR') {
          socketFailure('edit_message', socket, err);
        }
        socket.emit('message_error', { messageId, error: err.message, code: errorCodeFor(err) });
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
          socketFailure('mark_delivered', socket, err);
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
          socketFailure('mark_read', socket, err);
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
        socketFailure('typing', socket, err);
      }
    });

    // conversationRoomIds is filled in by the room-join below and read by
    // the disconnect handler, so a user_offline broadcast can reach the
    // same rooms user_online was announced to -- socket.rooms can't be
    // relied on for this by the time 'disconnect' fires (socket.io has
    // already left the socket from every room before that event runs).
    let conversationRoomIds = [];

    socket.on('disconnect', async (reason) => {
      try {
        await db.query('UPDATE users SET last_seen = NOW() WHERE id = $1', [socket.userId]);
      } catch (err) {
        socketFailure('disconnect (last_seen)', socket, err);
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
        socketFailure('connect (join rooms)', socket, err);
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

// Moves these users' live sockets into/out of a conversation's room.
// Sockets join their chats' rooms only when they connect (plus a personal
// user_<id> room), so a new chat or a member change must move them now.
function syncRooms(conversationId, userIds, action) {
  if (!io) return; // No socket server (e.g. tests) -- REST still works; clients refetch.
  for (const id of userIds) {
    const target = io.in(`user_${id}`);
    if (action === 'join') target.socketsJoin(`conv_${conversationId}`);
    else target.socketsLeave(`conv_${conversationId}`);
  }
}

module.exports = { initSocket, getIO, syncRooms };
