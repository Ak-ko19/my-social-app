# GO LIVE checklist

How to put the current `dev` branch live: back up the production
database, run migrations 015 → 083, check the environment variables,
deploy the backend and then the frontend, and test the live site. There
is also a rollback plan for when something goes wrong.

**Who runs this:** the owner. CLAUDE.md forbids Claude Code from touching
the production database or merging to `master`.

**Time:** about 45 minutes. Pick a quiet hour.

**Live today (before this go-live):**
- Code: `master` @ `3c5d884` (2026-09-22).
- Database: Neon, at migration **014**.
- Backend: Render, `https://my-social-app-ecjg.onrender.com`.
- Frontend: Vercel.

---

## 0. Before you start

- [ ] **CI is green on `dev`:**
  https://github.com/Ak-ko19/my-social-app/actions (see LATER.md #1).
- [ ] **The migration rehearsal passes.** It runs every production
  migration on a local copy of the live schema (never production):
  `cd e2e && bash golive-rehearsal.sh --old` must end with
  `REHEARSAL PASSED`.
  - Last run 2026-10-05, 015 → 039, all passed:
    - the result matches the app's schema exactly (189 columns, 102
      constraints, 84 indexes);
    - all old rows are kept, and old images and likes carry over;
    - the new code and the old live code both work on the migrated
      database;
    - running every `.down.sql` restores the 014 schema exactly.
- [ ] **Tools on your computer:**
  - `node` 20 or newer;
  - PostgreSQL 17 client tools (`pg_dump`, `pg_restore`, `psql`). They
    are already installed if you ran the backend tests: they live in
    `C:\Program Files\PostgreSQL\17\bin`.
- [ ] **The production connection string:** in Neon, open the project →
  **Connection Details**. Keep it only in your terminal session. Never
  paste it into a file, a commit or a chat.

In the steps below, `$PROD_DB` means that connection string. In Git Bash:

```bash
export PROD_DB='postgresql://…neon.tech/…?sslmode=require'   # paste yours
```

## 1. Back up the production database

Take **both** backups. They take a few minutes together.

- [ ] **A file on your computer.** It survives anything, even losing the
  Neon project:
  ```bash
  cd /c/MyProjects/Mysocialapp
  "/c/Program Files/PostgreSQL/17/bin/pg_dump.exe" --format=custom --no-owner --no-acl \
    --file="backup-before-golive-$(date +%Y%m%d-%H%M).dump" "$PROD_DB"
  ```
  - Check the file is not empty (usually a few MB):
    `ls -lh backup-before-golive-*.dump`.
  - It holds every user's data, including password hashes. `*.dump`
    files are gitignored, but also move it out of the project folder
    afterwards (for example to `Documents\backups\`).
- [ ] **A Neon branch.** This is the fastest restore. In Neon, open
  **Branches → Create branch** from `main`, name it
  `before-golive-YYYYMMDD`, and choose "current point in time". It costs
  nothing until it's used.

## 2. Check the environment variables (Render → backend service → Environment)

The new backend **refuses to start** if a required variable is missing or
malformed (`config/env.js`). That's safe: Render then marks the deploy
failed and keeps the old version running. It's still better to check now.

| Variable | Needed? | Value |
| --- | --- | --- |
| `DATABASE_URL` | required | the Neon connection string (already set) |
| `JWT_SECRET` | required | already set; **don't change it** (that logs everyone out). 32+ characters is recommended |
| `ALLOWED_ORIGINS` | **required now** | the frontend URL exactly, e.g. `https://my-social-app.vercel.app`, with **no trailing slash**. Separate several with commas |
| `FRONTEND_URL` | **required now** | the same frontend URL (email links point there), no trailing slash |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | needed for uploads | already set (photos work today) |
| `BREVO_API_KEY`, `EMAIL_FROM` | optional | turns on real emails; see LATER.md #3. Without them the app says "reset by email isn't available" |
| `CLEANUP_SECRET` | optional | turns on the daily cleanup job (32+ random characters); the same value goes into a GitHub Actions secret, see LATER.md #4 |
| `API_DOCS` | optional | `1` turns on the API reference (GET /docs, GET /openapi.json) in production. Leave it unset unless developers need it there |
| `SENTRY_DSN` | optional | also sends server errors to Sentry (see LATER.md #5). Errors are always kept in Admin → Errors anyway |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optional | push notifications (see LATER.md #7). Push is on only with both keys |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | optional | Cloudflare "are you human?" check on signup and forgot password. It's on only with both keys (see LATER.md #6) |
| `TRUST_PROXY` | leave unset | defaults to 1 on Render |
| `PORT`, `RENDER` | don't touch | Render sets these itself |

- [ ] `ALLOWED_ORIGINS` is set and has no trailing slash.
- [ ] `FRONTEND_URL` is set and has no trailing slash.
- [ ] While you're in Render, note the service's **Build command**
  (expected `npm install`), **Start command** (expected `node server.js`)
  and **Root directory** (expected `backend`). Also note whether
  **Auto-Deploy** is on for the `master` branch. You'll need that in
  step 4.

## 3. Run migrations 015 → 083 on production

Every migration only **adds** things (tables, columns, indexes). No
existing data is removed, so the old code on `master` keeps working while
they run. (051 narrows the app-language column that 033 adds to English
and Arabic; nothing on production has a language yet, so it changes no
rows there. 071 changes no tables: it turns `&amp;` `&lt;` `&gt;` in saved
chat messages back into `&` `<` `>`, as people typed them. Run it only
once, in the loop below -- never again by hand. 074 marks every existing
account as past the first-run steps, so only new sign-ups see them.)

- [ ] Confirm the database is at 014 (this should print one row,
  `verification_token`):
  ```bash
  "/c/Program Files/PostgreSQL/17/bin/psql.exe" "$PROD_DB" -At -c \
    "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='verification_token'"
  ```
  If it prints nothing, **stop**: production is older than expected. Ask
  Claude Code for help before going on.
- [ ] Confirm none of the new tables exist yet (this should print `0`):
  ```bash
  "/c/Program Files/PostgreSQL/17/bin/psql.exe" "$PROD_DB" -At -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_name IN ('post_media','stories','pages','communities','sessions','error_groups','link_previews','push_subscriptions','message_reactions','suggestion_dismissals','search_history','polls','poll_options','poll_votes','post_drafts','bookmark_collections','bookmark_collection_items','user_mutes','user_restrictions','close_friends','user_hidden_words','community_bans','page_admins','events','event_responses','media_uploads','daily_stats','admin_actions','known_devices','recovery_codes')"
  ```
- [ ] Run them **one at a time, in this order**, from `backend/`. Each
  prints `Migration applied successfully`.
  - Stop at the first `MIGRATION FAILED` and go to **Rollback A**
    (nothing is deployed yet, so it's simple).
  - 021 must run on its own before 022; running them one per command
    already does that.
  ```bash
  cd /c/MyProjects/Mysocialapp/backend
  for m in 015_add_fk_lookup_indexes 016_add_reactions 017_add_post_media 018_add_stories \
           019_add_comment_replies_likes 020_add_post_visibility 021_add_message_image_type \
           022_add_message_replies_images 023_add_group_chats 024_add_notification_preferences \
           025_add_admin_moderation 026_add_communities 027_add_pages 028_add_sessions \
           029_add_cleanup_indexes 030_add_error_log 031_report_comments_messages \
           032_add_suspensions 033_add_user_language 034_add_link_previews \
           035_add_only_me_visibility 036_add_push_subscriptions \
           037_add_message_notification_settings 038_report_groups_pages \
           039_add_performance_indexes 040_add_message_reactions \
           041_add_message_forwarded 042_add_group_photo 043_add_profile_links \
           044_add_cover_photo 045_add_pinned_post 046_add_suggestion_dismissals \
           047_add_post_search_index 048_add_hashtag_search_index 049_add_search_history \
           050_add_polls 051_drop_myanmar_ui_language 052_add_post_drafts \
           053_add_poll_ended_notified 054_add_bookmark_collections 055_add_user_mutes \
           056_add_user_restrictions 057_add_close_friends 058_add_interaction_permissions \
           059_add_activity_indexes 060_add_hidden_words 061_add_community_bans \
           062_add_group_notifications 063_add_page_admins 064_add_page_notifications \
           065_add_events 066_add_event_notifications 067_add_media_uploads \
           068_add_daily_stats 069_add_admin_actions 070_add_comments_post_id_index \
           071_message_text_as_typed 072_add_login_alerts 073_add_two_factor \
           074_add_onboarding 075_add_notification_type_index \
           076_add_notification_details 077_add_memories_notifications \
           078_add_session_login_challenge 079_add_post_shares 080_add_photo_alt_text \
           081_add_chat_pin_archive 082_add_story_replies 083_add_post_notification_levels; do
    DATABASE_URL="$PROD_DB" node scripts/run-migration.js "migrations/$m.up.sql" || break
  done
  ```
- [ ] Check the result (this should print `30`, then `42`, then `20`):
  ```bash
  "/c/Program Files/PostgreSQL/17/bin/psql.exe" "$PROD_DB" -At -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_name IN ('post_media','stories','pages','communities','sessions','error_groups','link_previews','push_subscriptions','message_reactions','suggestion_dismissals','search_history','polls','poll_options','poll_votes','post_drafts','bookmark_collections','bookmark_collection_items','user_mutes','user_restrictions','close_friends','user_hidden_words','community_bans','page_admins','events','event_responses','media_uploads','daily_stats','admin_actions','known_devices','recovery_codes')"
  "/c/Program Files/PostgreSQL/17/bin/psql.exe" "$PROD_DB" -At -c \
    "SELECT count(*) FROM information_schema.columns WHERE (table_name = 'reports' AND column_name IN ('target_owner_id','target_snapshot')) OR (table_name = 'users' AND column_name IN ('banned_until','language')) OR (table_name = 'notification_preferences' AND column_name = 'messages') OR (table_name = 'conversation_participants' AND column_name = 'muted_until') OR (table_name = 'messages' AND column_name = 'is_forwarded') OR (table_name = 'conversations' AND column_name = 'avatar_url') OR (table_name = 'users' AND column_name = 'links') OR (table_name = 'users' AND column_name = 'cover_url') OR (table_name = 'users' AND column_name = 'pinned_post_id') OR (table_name = 'polls' AND column_name = 'ended_notified') OR (table_name = 'comments' AND column_name = 'awaiting_approval') OR (table_name = 'stories' AND column_name = 'close_friends') OR (table_name = 'users' AND column_name IN ('message_permission','comment_permission','hidden_words_mode')) OR (table_name = 'notifications' AND column_name = 'community_id') OR (table_name = 'notification_preferences' AND column_name = 'groups') OR (table_name = 'notifications' AND column_name = 'page_id') OR (table_name = 'notification_preferences' AND column_name = 'pages') OR (table_name = 'notifications' AND column_name = 'event_id') OR (table_name = 'notification_preferences' AND column_name = 'events') OR (table_name = 'notifications' AND column_name = 'device') OR (table_name = 'users' AND column_name IN ('totp_secret','totp_pending_secret','totp_enabled_at','totp_last_step','totp_failures','totp_failures_since','onboarded_at')) OR (table_name = 'notifications' AND column_name = 'details') OR (table_name = 'users' AND column_name = 'time_zone') OR (table_name = 'notification_preferences' AND column_name = 'memories') OR (table_name = 'sessions' AND column_name = 'login_challenge') OR (table_name = 'posts' AND column_name IN ('shared_post_id','is_share')) OR (table_name = 'notification_preferences' AND column_name = 'shares') OR (table_name = 'post_media' AND column_name = 'alt_text') OR (table_name = 'post_drafts' AND column_name = 'media_alts') OR (table_name = 'conversation_participants' AND column_name IN ('pinned_at','archived_at'))"
  "/c/Program Files/PostgreSQL/17/bin/psql.exe" "$PROD_DB" -At -c \
    "SELECT count(*) FROM pg_indexes WHERE indexname IN ('idx_messages_conversation_id','idx_post_hashtags_hashtag','idx_participants_last_read','idx_story_views_viewer','idx_posts_content_fts','idx_hashtags_tag_trgm','idx_search_history_user_recent','idx_poll_votes_user','idx_post_drafts_due','idx_polls_end_queue','idx_bookmark_collections_user_name','idx_users_created_at','idx_comments_created_at','idx_reports_created_at','idx_admin_actions_created','idx_known_devices_last_seen','idx_notifications_user_type_created','idx_posts_month_day','idx_sessions_login_challenge','idx_posts_shared_post_id')"
  ```
  - 039, 047, 048, 059, 075, 077, 078 and 079 build indexes, which briefly holds back writes to each
    table while they run: seconds at today's size, another reason for a
    quiet hour.

## 4. Deploy the backend, then the frontend

Backend first: the new frontend needs the new API. The old frontend
keeps working against the new backend.

- [ ] Merge `dev` into `master` on GitHub. Open a pull request
  **dev → master** and read the CI result on the PR. Then merge.
- [ ] **Backend (Render):**
  - If Auto-Deploy is on for `master`, it deploys by itself.
  - If not, use Render → **Manual Deploy → Deploy latest commit**.
  - Wait for "Live". If it shows "Deploy failed", open the logs. A
    `[config] The server can't start` message lists exactly which
    variable to fix (step 2). The old version stays live meanwhile.
- [ ] **Backend is up:**
  - `https://my-social-app-ecjg.onrender.com/health` answers
    `{"status":"ok","db":"ok",…}`. `"db":"down"` means the backend can't
    reach Neon: check `DATABASE_URL`.
  - Optional, free: add that `/health` URL to an uptime monitor (e.g.
    UptimeRobot) to get an email if the site goes down.
  - `https://my-social-app-ecjg.onrender.com/config` answers
    `{"emailEnabled":false}`, or `true` once Brevo is set up.
- [ ] **Frontend (Vercel):** it deploys from `master` by itself. Wait for
  "Ready".
- [ ] **Make yourself admin** (new admin panel):
  ```bash
  cd /c/MyProjects/Mysocialapp/backend
  DATABASE_URL="$PROD_DB" node scripts/make-admin.js <your-username>
  ```

## 5. Smoke test the live site

Do this in a normal browser window, then again on a phone.

- [ ] **Core flows:**
  - [ ] Sign up a new test account, then log out and log in.
  - [ ] Create a post with text and 2 photos. It appears at the **top of
    Home** right away.
  - [ ] React to a post and comment on it. The other account gets a
    notification (use a second browser or a phone).
  - [ ] Send a DM and a voice message between the two accounts.
  - [ ] Switch the language to Arabic (right-to-left) and back to
    English (the only two), and try light and dark mode.
  - [ ] Forgot password: with no Brevo key it says reset by email isn't
    available. With a key, the email arrives.
- [ ] **Photos are deleted with their post (Day 4):**
  - [ ] Open one of the test post's photos in a new tab and copy its URL.
  - [ ] Delete the post.
  - [ ] Within a minute, the photo URL returns an error in a private
    window. The CDN can take a few minutes.
- [ ] **Rate limits are per person (Day 2)**, using two different
  networks (e.g. Wi-Fi and phone data):
  - [ ] On network A, log in with a wrong password 6 times. The 6th says
    "Too many login attempts".
  - [ ] On network B, log in **correctly** at the same time. It works.
    If B is also blocked, set `TRUST_PROXY=2` on Render, redeploy and
    repeat.
  - Since Day 11, attempts on that account after the 3rd wrong password
    take a few seconds to answer, on every network. That is expected, as
    long as B still gets in.
- [ ] **Moderation (Day 12):** with a second test account:
  - Report a comment ("Report" under it) and a DM message (the flag
    beside it). Both appear
    under Settings → Moderation → Reports, showing only the reported text.
  - Remove the message: it shows as deleted in the chat.
  - Suspend the test account for 1 day. Logging in says "suspended
    until …". Then "Lift suspension", and it can log in again.
  - Day 24: the flag on a group's or page's screen reports it. It
    appears in Reports, and "Remove group/page" asks before deleting.
- [ ] **Push notifications (Day 22), only if the VAPID keys are set:**
  - On a phone, use Chrome (Android) or the installed app (iPhone:
    Share → Add to Home Screen first).
  - Settings → Notifications → turn on "Push notifications on this
    device".
  - Close the app. From another account, like your post and send you a
    message: two notifications arrive. Tapping one opens that post or
    chat.
  - Day 23: in that chat, tap the bell → "For 8 hours". The next message
    from them doesn't buzz. Unmute, and it does again.
- [ ] **"Only me" posts (Day 20):**
  - Write a post with the audience "Only me". It shows a lock.
  - A second test account that follows you doesn't see it on Home, on
    your profile, or by opening its link.
  - Change it to Public from the ⋯ menu; now they can.
- [ ] **Links (Day 19):**
  - Post a link to a news article. It's clickable, and a card with the
    site, title and description appears under the post.
  - Paste a public post's link (Share → copy) into Telegram or a Facebook
    post. It shows the author and text, not just "MySocialApp".
  - If it doesn't, check the link with Facebook's Sharing Debugger
    (developers.facebook.com/tools/debug, no login needed for a basic
    check).
  - A followers-only post's link shows only the generic card.
  - Day 24: a public profile's link shows the name, bio and photo; a
    page's link shows its name and description. A private profile shows
    only the generic card.
- [ ] **Bot protection (Day 11):**
  - Signing up at normal speed shows no extra step and no error.
  - Signup and Forgot password take up to 3 seconds if you submit very
    fast.
  - If `TURNSTILE_*` keys are set (LATER.md #6), the Cloudflare box
    appears on those two pages and must be ticked.
- [ ] **Signing out other devices (Day 8):**
  - People who were already signed in stay signed in after the deploy.
  - Sign in on a phone and a computer. On the computer, change the
    password (Settings → Account).
  - The computer shows "…signed out on your other devices" and stays
    signed in. The phone is sent to the login screen on its next tap.
  - Sign in on the phone again. Settings → **Where You're Logged In**
    lists both devices. "Log out" on the phone's row signs it out.
- [ ] **Error log (Day 10):** Settings → Moderation → **Errors**. It
  should be empty or nearly so. Anything listed there is a real error
  from the live site: open "Details", and paste it into the next session
  if it looks unexpected.
- [ ] **Security headers (Day 3):** open the site. No page is broken, and
  the browser console (F12) shows no "Content Security Policy" errors.
- [ ] **Clean up old Cloudinary leftovers (Day 4).** Dry run first:
  ```bash
  cd /c/MyProjects/Mysocialapp/backend
  DATABASE_URL="$PROD_DB" CLOUDINARY_CLOUD_NAME=… CLOUDINARY_API_KEY=… CLOUDINARY_API_SECRET=… \
    npm run cloudinary:orphans
  ```
  Read the list. If it looks right, run the same command again with
  `-- --delete` at the end.
- [ ] **Convert old Zawgyi Myanmar text to Unicode (Day 43).** New text is
  converted as it's written; this fixes what was written before, and
  indexes Burmese/Arabic #tags in old posts. Dry run first:
  ```bash
  cd /c/MyProjects/Mysocialapp/backend
  DATABASE_URL="$PROD_DB" npm run convert:zawgyi
  ```
  It lists, per kind of text, how many rows are in Zawgyi. If that looks
  right, run it again with `-- --apply` at the end. Running it twice is
  harmless (the second run finds nothing). Text you can't read in the app
  afterwards → restore from the backup taken in step 1.
- [ ] **GitHub Actions now runs on `master`:**
  - CI runs on the merge.
  - **Keep-alive** starts its 10-minute schedule within the hour.

If everything above passes, you're live. Delete the test account (Settings
→ Account → Delete) and keep the backup file for at least 2 weeks.

---

## Rollback

Choose by **how far you got** and **how long the new version has been
live**.

### A. A migration failed (nothing deployed yet)

The old code is still live and works with a partly migrated database,
because every migration only adds things. Two options:
- **Simplest:** restore the Neon branch from step 1: Neon → Branches →
  `before-golive-…` → **Restore** onto `main`. Then ask Claude Code
  about the error and try again another day.
- Or roll back only what ran, newest first, with the matching `.down.sql`
  files (e.g. `migrations/017_add_post_media.down.sql`, then 016, then
  015).

### B. The new version is broken, and it went live **less than about an hour ago**

1. **Frontend:** Vercel → Deployments → the previous deployment →
   **Promote to Production** (instant).
2. **Backend:** Render → Events/Deploys → the previous deploy →
   **Rollback** (or Redeploy that commit).
3. **Keep the migrated database.** The old code works with it because
   everything was only added.
4. On GitHub, revert the merge on `master` (the PR page has a **Revert**
   button) so the next auto-deploy doesn't bring the broken version
   back.

⚠️ This is only safe while users haven't used the new privacy features.
The old code **does not know** about:
- followers-only and "only me" posts (it would show them to everyone).
  This is also why `035_add_only_me_visibility.down.sql` refuses to run
  while "only me" posts exist; its first lines explain the options;
- private groups (it would show their posts in feeds);
- bans (banned people could log in again).

### C. The new version has been live longer (people are using new features)

Don't do a code-only rollback: see the warning under B. Instead:
- **Preferred:** keep the new version and fix forward. Ask Claude Code
  with the error message or logs, and the fix goes out on `dev`, then
  `master`.
- **Last resort (loses everything written since go-live):** follow B's
  steps 1, 2 and 4, **and** restore the database from the backup. Use
  the Neon branch (Restore) or the dump file:
  ```bash
  "/c/Program Files/PostgreSQL/17/bin/pg_restore.exe" --clean --if-exists --no-owner --no-acl \
    --dbname="$PROD_DB" backup-before-golive-YYYYMMDD-HHMM.dump
  ```

After any rollback, write down what happened in LATER.md so the next
session can pick it up.
