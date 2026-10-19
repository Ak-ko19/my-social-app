# Real-time events (Socket.IO)

Live updates for chats come over [Socket.IO](https://socket.io) on the same
server as the REST API (`/openapi.json`, `/docs`). The REST API can do
everything on its own; the socket only adds instant delivery, typing and
presence. Notifications are not sent over the socket: the app reads
`GET /notifications/unread-count`, and web push covers a closed app.

`backend/tests/api/realtimeDoc.test.js` checks that every event the server
listens to or emits is in the tables below, and nothing else is.

## Connecting

```js
import { io } from 'socket.io-client';
const socket = io(API_URL, { auth: { token } }); // the token from POST /login
```

- The token is checked like a REST request's: a missing, invalid or expired
  token, a signed-out session, or a banned or suspended account refuses the
  connection (`connect_error`).
- On connect, the socket joins a room for each of your chats, and a personal
  room. A chat created, or a group you are added to, later joins the room at
  once (no reconnect needed). Removed from a group, you leave its room.
- Signing a session out (`DELETE /sessions/:id`, a password change, a ban)
  disconnects its sockets.

## You send

| Event | Payload | What happens |
| --- | --- | --- |
| `send_message` | `{ conversationId, content, clientTempId?, replyToMessageId? }` | Same rules as `POST /conversations/{id}/messages`. You get `message_ack`, everyone in the chat (you too) gets `new_message`; or you get `message_error`. |
| `edit_message` | `{ conversationId, messageId, content }` | Your text message, within 15 minutes. Everyone gets `message_edited`. |
| `delete_message` | `{ conversationId, messageId }` | Unsend your message. Everyone gets `message_deleted`. |
| `mark_delivered` | `{ conversationId, messageId }` | A message reached this device. Everyone gets `message_status_update` (`delivered`). |
| `mark_read` | `{ conversationId, messageId? }` | You read the chat up to that message (default: the newest). Everyone gets `message_status_update` (`read`). |
| `typing` | `{ conversationId }` | You are typing; the others get `user_typing`. Send it again every few seconds while typing. |
| `disconnect` | -- (Socket.IO's own) | When your last socket goes, your chats get `user_offline` and your "last seen" is saved. |

## You receive

| Event | Payload | When |
| --- | --- | --- |
| `new_message` | a `Message` (see `/openapi.json`) | Anyone sends in one of your chats (socket or REST: text, voice, photo, forwarded). |
| `message_ack` | `{ clientTempId, message }` | Your `send_message` was saved; match it to your optimistic copy by `clientTempId`. |
| `message_error` | `{ clientTempId?, messageId?, error, code }` | Your socket action failed. `code`: `VALIDATION` (fix and resend), `FORBIDDEN` (cannot be sent here), `NOT_FOUND`, `RATE_LIMITED` or `SERVER_ERROR` (try again). |
| `message_edited` | `{ conversationId, message }` | A message was edited. |
| `message_deleted` | `{ conversationId, messageId, deletedAt }` | A message was unsent (by its sender, or removed by an admin). |
| `message_status_update` | `{ conversationId, messageIds, status, lastReadMessageId?, readerId? }` | Messages were delivered or read. |
| `message_reaction` | `{ conversationId, messageId, reactions }` | A reaction was added, changed or removed. |
| `user_typing` | `{ conversationId, userId }` | Someone in the chat is typing. |
| `user_online` | `{ userId }` | Someone in one of your chats came online. |
| `user_offline` | `{ userId }` | ...and went offline. |
| `group_updated` | `{ conversationId }` | A group's name, photo, members or admins changed (or you were added or removed): fetch `GET /conversations/{id}` again. |

Missed events (offline, a dropped connection) are not replayed: after a
reconnect the app fetches the chat list and the open chat again.
