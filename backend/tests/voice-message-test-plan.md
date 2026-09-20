# Voice Message — Test Checklist & Results

Test checklist for the full voice-message feature (record → optimistic
upload → Cloudinary → persist → broadcast → custom playback), following
this project's manual Thunder Client / written-test-script style (see
[delete-message-test-plan.md](./delete-message-test-plan.md) for the same
approach applied to an earlier feature — no automated test framework is
installed in this project).

**Environment note:** this pass was run with the backend REST/socket API
live against the real dev DB and the real Cloudinary account, driven by
Node scripts (`fetch`, `FormData`, `socket.io-client`) and literal `curl`
calls where the checklist explicitly asked for curl. The Chrome browser
extension was not available in this environment, so anything that
requires an actual browser (a real record button press, an actual
microphone, an actual iOS Safari device, clicking play/pause) could not be
driven directly — those are marked **NOT RUN** below with the manual steps
to run them yourself, same as the rest of this checklist is written for.

---

## 1. Record and send on desktop Chrome

**Backend half — PASS.** Verified with a request shaped exactly like what
Chrome's `MediaRecorder` actually produces (`Content-Type:
audio/webm;codecs=opus`, `clientTempId` attached):
- Upload succeeds (`201`), row comes back `type: 'voice'`, `media_url`
  ending in `.mp3` (normalized — see Compatibility Hardening notes below),
  `duration_seconds` set, `client_temp_id` echoed back unchanged.
- The recipient's own socket connection receives a `new_message` broadcast
  with the same `id`/`media_url` in real time (checked with a live
  `socket.io-client` connection, not mocked).

**Frontend half — NOT RUN (needs a browser).** Manual steps:
1. Open the conversation in Chrome as User A, with User B's tab open in a
   second window/profile.
2. Hold the mic button, speak, release.
3. **Expect:** the bubble appears immediately with a "sending" look
   (faded/spinner, matching the same visual state as an optimistic text
   message), audio locally playable right away via the recorded blob.
4. **Expect:** within a couple of seconds it flips to the sent state (no
   more spinner), and User B's tab shows the same message appear live with
   no page refresh.

## 2. Record and send on iOS Safari

**Backend half — PASS.** Verified with a request shaped like Safari's
`MediaRecorder` output (`Content-Type: audio/mp4`):
- Upload succeeds (`201`), also normalized to a `.mp3` `media_url`.
- Fetched that delivered URL directly: `200`, `Content-Type: audio/mpeg` --
  playable by any client's `<audio>` element regardless of which browser
  originally recorded it. This specifically closes the bug found and fixed
  in the compatibility-hardening pass: before that fix, a Chrome-recorded
  `.webm` file would never play in Safari's `<audio>` element (no native
  WebM/Opus decode support there) -- forcing Cloudinary to always deliver
  `.mp3` regardless of upload format is what makes cross-browser playback
  actually work now.

**Device half — NOT RUN (needs a real iOS Safari device — a simulator's**
**audio stack is not a reliable substitute for this specific check).**
Manual steps:
1. Open the deployed/dev frontend in iOS Safari, record and send a voice
   message.
2. **Expect:** recording starts on hold (mic permission prompt appears the
   first time), the timer/level bars animate, release sends it.
3. Open the same conversation in Chrome (desktop or Android) as the other
   participant.
4. **Expect:** the Safari-recorded message plays back correctly there, and
   vice versa -- record one from Chrome and confirm it plays on the iOS
   Safari device.

## 3. Microphone permission denied

**NOT RUN (needs a real browser + an actual permission denial).** Manual
steps, once per browser (Chrome, Firefox, Safari all have different denial
flows worth checking individually per the compatibility-hardening pass):
1. Deny microphone access when prompted (or pre-block it in site settings,
   then attempt to record).
2. **Expect:** no crash, no unhandled promise rejection in the console. A
   clear inline message appears near the mic button: "Microphone access
   was denied. Allow microphone access in your browser settings to send
   voice messages."
3. Repeat with the mic already in use by another app/tab (if easy to
   arrange) -- **expect** the more specific "already in use by another app
   or browser tab" message instead of the generic one.

## 4. Recording exceeds max duration

**NOT RUN (needs a real ~2-minute hold).** Manual steps:
1. Hold the mic button and keep holding past 2 minutes (`MAX_DURATION_SECONDS`
   in `VoiceRecorderButton.jsx`).
2. **Expect:** as the timer approaches the cap (from ~1:45), the timer
   changes color as a warning.
3. **Expect:** at exactly 2:00, recording auto-stops and proceeds straight
   to sending -- without the user releasing -- and the resulting message
   sends successfully like a normal release would.

## 5. Cancel before releasing

**NOT RUN (needs a real hold + slide gesture).** Manual steps:
1. Hold the mic button, then slide the pointer left past the cancel
   threshold before releasing.
2. **Expect:** the hint text changes to "Release to cancel", and releasing
   there discards the recording -- no bubble appears in the thread at all.
3. **Verify no orphaned upload:** open the Network tab before doing this --
   **expect zero requests** to `POST /conversations/:id/messages/voice`
   for a cancelled recording. This is expected to hold by construction, not
   just by observation: `useVoiceRecorder.cancel()` sets a `cancelledRef`
   flag that `recorder.onstop` checks before ever calling `onComplete`, so
   the upload function is never invoked in the first place -- there's no
   upload to orphan because there's no upload attempt at all.

## 6. Offline / socket disconnected during send

**Backend/network half — PASS.** Voice sends are REST-only already (no
socket send path exists for voice -- see `useConversationMessages.
sendVoiceMessage`), so a disconnected *socket* alone never blocks a voice
send; the real failure mode is the REST call itself failing (no network at
all). Verified that an upload attempt against an unreachable server
rejects promptly with a network error rather than hanging indefinitely --
this is exactly the rejection the frontend's `attemptVoiceUpload().catch()`
depends on to mark the bubble `'failed'`.

**Frontend half — NOT RUN (needs a browser with DevTools offline mode).**
Manual steps:
1. Record and release a voice message with DevTools set to Offline (or
   airplane mode on a phone).
2. **Expect:** the bubble still appears optimistically, then flips to a
   failed state with a "Voice message failed to send · Retry" button (the
   recorded blob is kept in memory the whole time, per
   `_voiceBlob` on the optimistic message object -- the user is never asked
   to re-record).
3. Restore connectivity, click Retry.
4. **Expect:** it re-uploads the SAME cached recording (no re-record
   prompt) and succeeds, replacing the failed bubble with the real one.

## 7. Only one voice message plays at a time

**NOT RUN (needs real audio playback in a browser).** The pause-
coordination logic (`VoicePlaybackProvider`) was verified by code review in
the compatibility-hardening pass -- calling `.pause()` on the previously-
registered `<audio>` element before registering a new one, relying on that
`.pause()` firing an async native `'pause'` event so the ordering with the
ref update is safe -- but this is a claim about behavior, not something
exercised against real `<audio>` elements. Manual steps:
1. In a conversation with two or more voice messages, press play on the
   first.
2. While it's still playing, press play on a second one.
3. **Expect:** the first one's play button switches back to the play icon
   (paused) the instant the second starts, and only the second is audible.

## 8. Non-audio file directly to the upload endpoint (bypassing the frontend)

**PASS.** Ran literally via `curl` (not just a Node `fetch` simulation), as
the checklist specifically asked:

```
curl -X POST http://localhost:3000/conversations/<id>/messages/voice \
  -H "Authorization: Bearer <token>" \
  -F "audio=@not-audio.txt;type=text/plain"
```
→ `HTTP 400`, body: `Only WEBM, MP4, OGG, and MPEG audio files are allowed`

Also checked `image/png` and `application/pdf` declared content types via
the same path -- both `400` for the same reason. The rejection happens in
multer's `fileFilter` before the request body is even fully processed, well
before any Cloudinary call.

## 9. Oversized audio file

**PASS.** Ran via literal `curl` with a real 6MB file (limit is 5MB):

```
curl -X POST http://localhost:3000/conversations/<id>/messages/voice \
  -H "Authorization: Bearer <token>" \
  -F "audio=@oversized.bin;type=audio/webm"
```
→ `HTTP 400` in 0.664s, body: `File too large`. For comparison, a real
successful upload (which has to reach Cloudinary and transcode to mp3)
takes several seconds -- confirming this rejection happens at multer's
`limits.fileSize` check, before the file ever leaves the server for
Cloudinary.

## 10. Non-participant cannot reach the voice endpoint or the media_url

**PASS.**
- A non-participant's upload attempt: `403 Forbidden`, rejected by
  `requireConversationParticipant` before multer even parses the body (no
  Cloudinary upload attempted for a request that was always going to be
  rejected).
- A non-participant's `GET /conversations/:id/messages` (the only endpoint
  that would ever expose a `media_url`): also `403` -- there is no
  authorized path in this API for a non-participant to retrieve a voice
  message's `media_url`.

**Known, pre-existing characteristic (not a new voice-message-specific
issue):** once a real participant HAS a `media_url`, that Cloudinary URL
itself is not access-controlled at the CDN level (no signed URL/token) --
anyone who obtains the raw URL (e.g. a participant sharing it outside the
app) could fetch the audio directly from Cloudinary. This matches exactly
how this app's existing post/avatar images already work (also plain public
Cloudinary URLs) -- it's an app-wide design characteristic, not something
introduced by or unique to voice messages, so it wasn't treated as a bug to
fix here.

## 11. Voice messages via REST pagination (not just live)

**PASS.** Sent several voice messages, fetched the first page with a small
`limit` to force a `nextCursor`, then fetched the next page using that
cursor. An older, second-page voice message still has `type: 'voice'`, a
valid `.mp3` `media_url`, and `duration_seconds` intact -- structurally
identical to a freshly-arrived one.

`VoiceMessagePlayer` itself has no branch anywhere that depends on how a
message entered `messages` state (`mergeMessages` is called identically by
the REST-pagination path and the live `new_message` socket handler in
`useConversationMessages`), so this backend-level confirmation, combined
with that shared code path, is strong evidence the frontend rendering is
consistent too -- though actually scrolling up to load older history and
watching a voice bubble render/play was **NOT RUN** (needs a browser).
