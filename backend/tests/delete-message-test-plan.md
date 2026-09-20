# Delete Message — Manual Test Plan

Manual test script for the delete-message feature (REST `DELETE
/conversations/:id/messages/:messageId`, socket `delete_message` /
`message_deleted`), following this project's existing Thunder Client +
in-browser testing style (see CLAUDE.md "Completed Features" — no automated
test framework is installed in this project).

## Setup

- Two test user accounts that already have a direct conversation with at
  least a few messages between them. Call them **User A** and **User B**.
- Thunder Client (or any REST client) with a JWT for each user (`POST
  /login`), saved as `{{tokenA}}` / `{{tokenB}}`.
- Note a `conversationId` shared by A and B, and the numeric `id` of a couple
  of existing messages in it to delete.
- Backend running locally (`npm run dev` or equivalent) with sockets enabled.

---

## 1. Sender deletes own message (REST) — success

1. As **User A**, send a message in the conversation (via the app, or `POST
   /conversations/:id/messages`). Note its `id` and `content`.
2. In Thunder Client: `DELETE {{baseUrl}}/conversations/{{conversationId}}/messages/{{messageId}}`
   with header `Authorization: Bearer {{tokenA}}`.
3. **Expect:** `200 OK`, JSON body is the message object with
   `deleted_at` set (non-null) and `content: null`.
4. `GET /conversations/:id/messages` (either user's token) — the message is
   still present at the same position in the list (no gap), but its content
   is scrubbed / `deleted_at` is set.
5. In the app UI (both A and B's browser tabs, open on this conversation):
   the bubble shows *"This message was deleted"* instead of the original
   text.

## 2. Non-sender attempts delete — 403

1. As **User A**, send a message. Note its `id`.
2. As **User B** (a participant, but not the sender): `DELETE
   /conversations/:id/messages/:messageId` with `Authorization: Bearer
   {{tokenB}}`.
3. **Expect:** `403 Forbidden`, and the message is unchanged (`deleted_at`
   still null on a follow-up `GET`).
4. Repeat over the socket: connect as User B, `socket.emit('delete_message',
   { conversationId, messageId })`.
5. **Expect:** User B's socket receives a `message_error` event with
   `code: 'FORBIDDEN'` and the same `messageId`. No `message_deleted` event
   is broadcast, and the message is unchanged on a follow-up `GET`.

## 3. Delete propagates in real time to other connected clients

1. Open the same conversation in two browser windows/tabs: one logged in as
   User A, one as User B. Both connected (check the online dot / no
   "reconnecting" state).
2. As User A, delete one of A's own messages using the new delete button on
   the bubble (hover to reveal it, or it's always visible on a touch/coarse
   pointer device).
3. **Expect (User A's tab):** the bubble immediately (optimistically) shows
   the deleted placeholder.
4. **Expect (User B's tab, no manual refresh):** within a moment, the same
   message's bubble updates in place to *"This message was deleted"* — this
   confirms the `message_deleted` socket broadcast to `conv_<id>` is
   received and handled.
5. Open a **third** tab also logged in as User A (simulating a second
   device) on the same conversation. Delete a message from tab 1.
   **Expect:** tab 3 (A's other device) also updates — confirms the
   broadcast goes to the whole room, including the deleting user's own other
   connections, not just `socket.to()`-excluded peers.

## 4. Delete falls back to REST when the socket is down

1. Open the conversation in the browser as User A. Confirm the socket is
   connected.
2. Disconnect the socket without closing the tab — e.g. open DevTools →
   Network → set to "Offline", or throttle/block the socket.io WS
   connection, or stop the backend's socket layer temporarily while REST
   stays reachable (or simplest: use DevTools to block the `socket.io`
   request URL pattern, then reload only the JS runtime state by triggering
   a manual reconnect attempt that fails).
3. With the socket disconnected, click delete on one of your own messages.
4. **Expect:** the delete still succeeds — the bubble shows the deleted
   placeholder, confirmed via the REST response (check the Network tab for a
   `DELETE /conversations/:id/messages/:messageId` request firing instead of
   a `delete_message` socket emit).
5. Restore connectivity. Reload the conversation (`GET
   /conversations/:id/messages`) and confirm the message is still shown as
   deleted (persisted server-side, not just a local optimistic artifact that
   got lost).
6. With User B's tab open and connected throughout, confirm B's view also
   updates once the REST call lands (the REST handler still emits
   `message_deleted` to the room via `getIO()`).

## 5. Inbox preview updates when the deleted message was the last message

1. As User A, send a message to User B — make sure it's the newest message
   in that conversation.
2. Open the **inbox** (`/messages`) in a second tab, logged in as User B,
   with the conversation list visible. Confirm the preview text shows that
   message's content.
3. As User A (first tab, in the open conversation), delete that same
   message.
4. **Expect (User B's inbox tab, live, no refresh):** the conversation row's
   preview text updates in place to *"This message was deleted"*.
5. Reload the inbox (`GET /conversations`) as either user — **expect** the
   preview still reads *"This message was deleted"* (this confirms the
   backend query change, not just the live socket patch, since a fresh load
   never runs the socket handler at all).
6. Negative case: delete a message that is **not** the most recent one in
   the conversation (e.g. an older message a few messages back). **Expect:**
   the inbox preview is unaffected — it still shows the actual last
   message's content, unchanged.

---

## Edge cases

### Deleting an already-deleted message is a no-op, not an error

1. Delete a message as its sender (as in test 1). Confirm success.
2. Delete the **same** `messageId` again (same sender, REST or socket).
3. **Expect:** `200 OK` again (REST) / no `message_error` (socket) — same
   already-deleted message object comes back, `deleted_at` unchanged from
   the first delete's timestamp (not bumped to a new `now()`).

### Deleting a read message doesn't change its read status

1. As User A, send a message to User B.
2. As User B, view the conversation so the message is marked `read` (`PUT
   /conversations/:id/read` or opening the chat). Confirm via `GET
   /conversations/:id/messages` that the message's `status` is `"read"`.
3. As User A, delete that message.
4. **Expect:** `GET /conversations/:id/messages` shows `deleted_at` set
   **and** `status` still `"read"` — deleting must not reset it back to
   `"sent"`/`"delivered"`.

### Deleting a non-existent message

1. `DELETE /conversations/:id/messages/999999999` (an id that doesn't exist)
   as a real participant.
2. **Expect:** `404 Not Found`.

### Deleting with a malformed id

1. `DELETE /conversations/:id/messages/not-a-number`.
2. **Expect:** `400 Bad Request`.
