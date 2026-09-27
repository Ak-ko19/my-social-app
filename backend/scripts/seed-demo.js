// C1: demo data for a LOCAL database -- realistic users, posts, comments,
// reactions, follows, DMs, a group chat, groups (communities), a page and
// notifications, for showing the app to investors.
//
//   npm run seed:demo          (from backend/, uses DATABASE_URL like the app)
//
// Safety:
// - Refuses to run unless DATABASE_URL points at this machine (localhost /
//   127.0.0.1 / ::1) and NODE_ENV isn't "production". There is no override.
// - Every demo account uses an @demo.mysocialapp.test email. Re-running
//   first deletes exactly those accounts (their posts, comments, messages,
//   follows... go with them via ON DELETE CASCADE, plus the groups they
//   created) and then recreates everything, so it's safe to run repeatedly
//   and never touches anyone else's data.
// - All in one transaction: a failure leaves the database as it was.
//
// Every demo account's password is DEMO_PASSWORD below (local demo only).
require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { parseHashtags } = require('../services/hashtagService');

const DEMO_DOMAIN = 'demo.mysocialapp.test';
const DEMO_PASSWORD = 'demo-password-123';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function assertLocalDatabase(url) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV is "production".');
  }
  if (!url) throw new Error('Refusing to seed: DATABASE_URL is not set.');
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('Refusing to seed: DATABASE_URL is not a valid URL.');
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to seed: database host "${host}" is not local. Demo data only goes into a database on this machine.`);
  }
}

// --- the demo world -----------------------------------------------------------
const USERS = [
  { key: 'thiri', bio: 'Product designer in Yangon. Coffee, sketchbooks and long walks by Inya Lake.', admin: true },
  { key: 'aungmin', bio: 'Software engineer · weekend hiker · always planning the next trip.' },
  { key: 'myamya', bio: 'Home cook sharing Burmese recipes 🍲 mohinga is life.' },
  { key: 'kyawzin', bio: 'Photographer. Golden hour at Shwedagon never gets old.' },
  { key: 'suwai', bio: 'Medical student. Private account — friends only.', private: true },
  { key: 'zawlin', bio: 'Football, music and good tea shops.' },
  { key: 'nandar', bio: 'Teacher & volunteer. Books over everything.' },
  { key: 'htetaung', bio: 'Founder @ a tiny startup. Building in public.' },
  { key: 'eiei', bio: 'Travel blogger — Bagan, Inle, Ngapali and beyond.' },
  { key: 'minthu', bio: 'Runs Mingalar Tea House. Tea leaf salad expert.' },
  { key: 'hlahla', bio: 'Graphic designer. Posters, zines, stickers.' },
  { key: 'phyowai', bio: 'Musician. Guitar covers every Friday.' }
];

// [author, content, hoursAgo, extras]
const POSTS = [
  ['thiri', 'Sunday morning sketch session at the tea shop ☕✏️ Who else draws while waiting for their mohinga? #Yangon #sketchbook', 3],
  ['aungmin', 'Planning a hike up Mount Popa next weekend. Anyone in? 🥾 #hiking #Myanmar', 5],
  ['myamya', 'Finally nailed my grandmother’s mohinga recipe. The secret is toasted rice flour! #mohinga #BurmeseFood', 7],
  ['kyawzin', 'Golden hour at Shwedagon tonight was unreal. Some evenings the sky just shows off. #Yangon #photography', 9],
  ['zawlin', 'Match night with the crew — tea, samosas and way too much shouting at the TV ⚽', 12],
  ['nandar', 'Our reading corner at the community library just got 40 new children’s books thanks to donations. Thank you all! 📚 #volunteering', 15],
  ['htetaung', 'Day 42 of building our startup: first 100 users signed up this week. Small team, big dreams. #startup #buildinpublic', 18],
  ['eiei', 'Sunrise over Bagan from a hot air balloon. Put this on your list. 🎈 #Bagan #travel', 22],
  ['thiri', 'New poster series for the Thingyan festival is done! Water, flowers and a lot of blue. #ThingyanFestival #design', 26],
  ['hlahla', 'Sticker sheet giveaway! Comment your favourite Burmese snack and I’ll pick three winners. #design', 30],
  ['phyowai', 'Friday cover: an old Myanmar classic on acoustic guitar. Requests for next week? 🎸 #music', 34],
  ['aungmin', 'Hot take: the best tea shop in Yangon is the one closest to your office. #Yangon', 40],
  ['myamya', 'Tea leaf salad (lahpet thoke) for lunch. Crunchy beans are non-negotiable. #BurmeseFood', 46],
  ['kyawzin', 'Rainy season street photography tips: shoot the reflections, not the rain. #photography', 52, { visibility: 'followers' }],
  ['htetaung', 'Looking for a frontend developer who loves React. DM me! #startup #jobs', 60],
  ['eiei', 'Inle Lake fishermen balance on one leg while rowing. Watched for an hour and still can’t believe it. #Inle #travel', 70],
  ['nandar', 'Reminder: free English conversation club every Saturday at 10am. Everyone welcome! #volunteering', 80],
  ['zawlin', 'New tea shop opened near Sule — their paratha is dangerously good.', 90],
  ['thiri', 'Working on the new app onboarding screens. Fewer steps, friendlier words. Feedback welcome! #design', 100],
  ['suwai', 'Exam week survival kit: flashcards, green tea and a playlist on repeat.', 110, { visibility: 'followers' }]
];

const COMMENTS = [
  // [postIndex, author, content, replyToCommentIndex?]
  [0, 'kyawzin', 'Love this! Post the sketch please 🙏'],
  [0, 'thiri', 'Will do once it’s coloured!', 0],
  [0, 'myamya', 'Mohinga + sketching = perfect Sunday'],
  [1, 'thiri', 'I’m in! What time do we leave?'],
  [1, 'aungmin', '6am from Yangon, carpool 🚗', 3],
  [1, 'eiei', 'Take lots of water, it gets hot near the top'],
  [2, 'nandar', 'Toasted rice flour! That’s the tip I needed.'],
  [2, 'zawlin', 'Can I come over for a bowl? 😄'],
  [3, 'thiri', 'Wow, the colours!'],
  [3, 'hlahla', 'This should be a poster.'],
  [6, 'thiri', 'Congrats on 100 users! 🎉'],
  [6, 'aungmin', 'Huge milestone, keep going!'],
  [7, 'kyawzin', 'Bucket list, officially.'],
  [8, 'hlahla', 'The blues are gorgeous 💙'],
  [8, 'myamya', 'Can I get a print?'],
  [8, 'thiri', 'Yes! Prints coming next week.', 14],
  [9, 'zawlin', 'Samosa, obviously.'],
  [9, 'thiri', 'Shwe yin aye on a hot day!'],
  [10, 'nandar', 'Please play something by Lay Phyu next!'],
  [14, 'thiri', 'Sharing this with a friend who’s looking 👀']
];

const REACTIONS = ['like', 'love', 'haha', 'wow', 'like', 'love', 'like'];

async function seed() {
  const url = process.env.DATABASE_URL;
  assertLocalDatabase(url);
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000);
  try {
    await client.query('BEGIN');

    // 1. Remove the previous demo run (only @demo.mysocialapp.test accounts).
    const old = await client.query('SELECT id FROM users WHERE email LIKE $1', [`%@${DEMO_DOMAIN}`]);
    const oldIds = old.rows.map((r) => r.id);
    if (oldIds.length) {
      await client.query('DELETE FROM communities WHERE created_by = ANY($1::int[])', [oldIds]);
      await client.query('DELETE FROM users WHERE id = ANY($1::int[])', [oldIds]);
    }

    // 2. Users. A real (non-demo) account holding one of the usernames stops the run.
    const taken = await client.query('SELECT username FROM users WHERE username = ANY($1::text[])', [USERS.map((u) => u.key)]);
    if (taken.rows.length) {
      throw new Error(`These usernames already belong to real accounts: ${taken.rows.map((r) => r.username).join(', ')}. Nothing was changed.`);
    }
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const id = {};
    for (const [i, u] of USERS.entries()) {
      const r = await client.query(
        `INSERT INTO users (username, email, password, bio, is_private, is_admin, email_verified, created_at, last_seen)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8) RETURNING id`,
        [u.key, `${u.key}@${DEMO_DOMAIN}`, hash, u.bio, Boolean(u.private), Boolean(u.admin), hoursAgo(24 * 30 + i), hoursAgo(i % 4)]
      );
      id[u.key] = r.rows[0].id;
    }

    // 3. Follows: a dense, realistic graph + one pending request to the private account.
    const follow = (a, b, status = 'accepted') =>
      client.query('INSERT INTO follows (follower_id, following_id, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id[a], id[b], status]);
    const everyone = USERS.map((u) => u.key);
    for (const a of everyone) {
      for (const b of everyone) {
        if (a === b || b === 'suwai') continue;
        // Deterministic ~60% density; thiri follows (and is followed by) almost everyone.
        const dense = (a.length * 7 + b.length * 3 + a.charCodeAt(0) + b.charCodeAt(1)) % 10 < 6;
        if (a === 'thiri' || b === 'thiri' || dense) await follow(a, b);
      }
    }
    for (const f of ['thiri', 'nandar', 'myamya']) await follow(f, 'suwai');
    await follow('zawlin', 'suwai', 'pending');

    // 4. Posts (+ hashtags).
    const postIds = [];
    for (const [author, content, h, extra = {}] of POSTS) {
      const r = await client.query(
        'INSERT INTO posts (user_id, content, visibility, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
        [id[author], content, extra.visibility || 'public', hoursAgo(h)]
      );
      const postId = r.rows[0].id;
      postIds.push(postId);
      const tags = parseHashtags(content);
      if (tags.length) {
        await client.query('INSERT INTO hashtags (tag) SELECT unnest($1::text[]) ON CONFLICT (LOWER(tag)) DO NOTHING', [tags]);
        await client.query(
          'INSERT INTO post_hashtags (post_id, hashtag_id) SELECT $1, id FROM hashtags WHERE LOWER(tag) = ANY($2::text[]) ON CONFLICT DO NOTHING',
          [postId, tags]
        );
      }
    }

    // 5. Reactions: popular posts get more.
    for (const [pi, postId] of postIds.entries()) {
      const count = [0, 3, 6, 8].includes(pi) ? 9 : 2 + (pi % 5);
      const reactors = everyone.filter((u) => u !== POSTS[pi][0]).slice(0, count);
      for (const [ri, u] of reactors.entries()) {
        await client.query(
          'INSERT INTO likes (post_id, user_id, reaction, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [postId, id[u], REACTIONS[(pi + ri) % REACTIONS.length], hoursAgo(POSTS[pi][2] - 0.5)]
        );
      }
    }

    // 6. Comments, replies and a few comment likes.
    const commentIds = [];
    for (const [ci, [pi, author, content, replyTo]] of COMMENTS.entries()) {
      const r = await client.query(
        'INSERT INTO comments (post_id, user_id, content, parent_comment_id, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [postIds[pi], id[author], content, replyTo === undefined ? null : commentIds[replyTo], hoursAgo(POSTS[pi][2] - 1 - ci * 0.05)]
      );
      commentIds.push(r.rows[0].id);
    }
    for (const [ci, u] of [[0, 'thiri'], [1, 'kyawzin'], [3, 'aungmin'], [10, 'htetaung'], [14, 'thiri']]) {
      await client.query('INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [commentIds[ci], id[u]]);
    }

    // 7. Bookmarks for the main demo account.
    for (const pi of [2, 7, 14]) {
      await client.query('INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2)', [id.thiri, postIds[pi]]);
    }

    // 8. Direct messages + a group chat.
    const direct = async (a, b, lines) => {
      const [lo, hi] = id[a] < id[b] ? [id[a], id[b]] : [id[b], id[a]];
      const c = await client.query("INSERT INTO conversations (type, user_a_id, user_b_id) VALUES ('direct', $1, $2) RETURNING id", [lo, hi]);
      const convId = c.rows[0].id;
      await client.query('INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)', [convId, id[a], id[b]]);
      return addMessages(convId, lines);
    };
    const addMessages = async (convId, lines) => {
      let last = null;
      for (const [i, [who, text, minsAgo]] of lines.entries()) {
        const m = await client.query(
          "INSERT INTO messages (conversation_id, sender_id, content, status, created_at) VALUES ($1, $2, $3, 'read', $4) RETURNING id",
          [convId, id[who], text, new Date(Date.now() - (minsAgo ?? (lines.length - i) * 7) * 60000)]
        );
        last = m.rows[0].id;
      }
      return { convId, last };
    };
    const aung = await direct('thiri', 'aungmin', [
      ['aungmin', 'Hey! Are you still up for Mount Popa?'],
      ['thiri', 'Yes!! Can I bring my sketchbook? 😄'],
      ['aungmin', 'Of course. We leave at 6am, I’ll pick you up.'],
      ['thiri', 'Perfect, see you then 🙌'],
      ['aungmin', 'Don’t forget sunscreen ☀️', 3]
    ]);
    // thiri hasn't read aungmin's last message -> one unread in the inbox.
    const aungMsgs = await client.query('SELECT id FROM messages WHERE conversation_id = $1 ORDER BY id', [aung.convId]);
    await client.query('UPDATE conversation_participants SET last_read_message_id = $1 WHERE conversation_id = $2 AND user_id = $3', [aungMsgs.rows[3].id, aung.convId, id.thiri]);
    await client.query('UPDATE conversation_participants SET last_read_message_id = $1 WHERE conversation_id = $2 AND user_id = $3', [aung.last, aung.convId, id.aungmin]);
    await client.query("UPDATE messages SET status = 'delivered' WHERE id = $1", [aung.last]);

    const mya = await direct('thiri', 'myamya', [
      ['thiri', 'Your mohinga post made me so hungry'],
      ['myamya', 'Come over on Sunday, I’ll make a big pot 🍲'],
      ['thiri', 'Deal! I’ll bring the fritters.', 60]
    ]);
    await client.query('UPDATE conversation_participants SET last_read_message_id = $1 WHERE conversation_id = $2', [mya.last, mya.convId]);

    const g = await client.query(
      "INSERT INTO conversations (type, name, created_by) VALUES ('group', 'Weekend Hikers 🥾', $1) RETURNING id",
      [id.aungmin]
    );
    const hikers = ['aungmin', 'thiri', 'kyawzin', 'eiei'];
    for (const u of hikers) {
      await client.query('INSERT INTO conversation_participants (conversation_id, user_id, role) VALUES ($1, $2, $3)', [g.rows[0].id, id[u], u === 'aungmin' ? 'admin' : 'member']);
    }
    const group = await addMessages(g.rows[0].id, [
      ['aungmin', 'Welcome to the hiking group!'],
      ['eiei', 'Excited! I’ll bring snacks.'],
      ['kyawzin', 'And I’ll bring the camera 📷'],
      ['thiri', 'Can’t wait. Weather looks good for Saturday.', 20]
    ]);
    await client.query('UPDATE conversation_participants SET last_read_message_id = $1 WHERE conversation_id = $2', [group.last, g.rows[0].id]);

    // 9. Groups (communities) with posts.
    const community = async (name, description, privacy, creator, members) => {
      const c = await client.query('INSERT INTO communities (name, description, privacy, created_by) VALUES ($1, $2, $3, $4) RETURNING id', [name, description, privacy, id[creator]]);
      const cid = c.rows[0].id;
      for (const u of [creator, ...members]) {
        await client.query("INSERT INTO community_members (community_id, user_id, role, status) VALUES ($1, $2, $3, 'member')", [cid, id[u], u === creator ? 'admin' : 'member']);
      }
      return cid;
    };
    const foodies = await community('Yangon Foodies', 'Where to eat in Yangon — street food, tea shops and home cooking.', 'public', 'myamya', ['thiri', 'zawlin', 'minthu', 'nandar', 'eiei']);
    const founders = await community('Myanmar Startup Founders', 'A private space for founders to share lessons and ask for help.', 'private', 'htetaung', ['thiri', 'aungmin']);
    await client.query("INSERT INTO community_members (community_id, user_id, status) VALUES ($1, $2, 'pending')", [founders, id.hlahla]);
    for (const [cid, author, content, h] of [
      [foodies, 'zawlin', 'Best paratha in Yangon — go! Drop your picks below.', 8],
      [foodies, 'myamya', 'Weekly thread: what did you cook this weekend?', 20],
      [founders, 'htetaung', 'How are you all handling payments for early customers? Would love to compare notes.', 30]
    ]) {
      await client.query('INSERT INTO posts (user_id, content, community_id, created_at) VALUES ($1, $2, $3, $4)', [id[author], content, cid, hoursAgo(h)]);
    }

    // 10. A business page with followers and posts.
    const p = await client.query(
      "INSERT INTO pages (name, category, description, owner_id) VALUES ('Mingalar Tea House', 'business', 'Family tea shop since 1998. Tea leaf salad, mohinga and the strongest milk tea in town.', $1) RETURNING id",
      [id.minthu]
    );
    for (const u of ['thiri', 'myamya', 'zawlin', 'nandar', 'eiei', 'kyawzin']) {
      await client.query('INSERT INTO page_follows (page_id, user_id) VALUES ($1, $2)', [p.rows[0].id, id[u]]);
    }
    for (const [content, h] of [
      ['This week’s special: shan noodles with extra crispy garlic 🍜 #BurmeseFood', 4],
      ['We’re open late on Friday for the football match ⚽ Tea is on us for the first 20 guests!', 28]
    ]) {
      await client.query("INSERT INTO posts (user_id, content, page_id, visibility, created_at) VALUES ($1, $2, $3, 'public', $4)", [id.minthu, content, p.rows[0].id, hoursAgo(h)]);
    }

    // 11. Notifications for the main demo account (some unread).
    const notify = (actor, type, pi, read, h) =>
      client.query('INSERT INTO notifications (user_id, actor_id, type, post_id, is_read, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [id.thiri, id[actor], type, pi === null ? null : postIds[pi], read, hoursAgo(h)]);
    await notify('kyawzin', 'like', 0, false, 2);
    await notify('myamya', 'comment', 0, false, 2.5);
    await notify('hlahla', 'like', 8, false, 20);
    await notify('eiei', 'follow', null, true, 48);
    await notify('htetaung', 'like', 18, true, 90);

    // 12. One pending report, so the admin Moderation screen has something to show.
    await client.query(
      "INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES ($1, 'post', $2, 'spam', 'Looks like a job scam, please check.')",
      [id.nandar, postIds[14]]
    );

    await client.query('COMMIT');
    console.log(`Demo data ready: ${USERS.length} users, ${POSTS.length + 5} posts, ${COMMENTS.length} comments, 3 chats, 2 groups, 1 page.`);
    console.log(`Log in as thiri@${DEMO_DOMAIN} (admin) or any <username>@${DEMO_DOMAIN} -- password: ${DEMO_PASSWORD}`);
    if (oldIds.length) console.log(`(Replaced the previous demo run's ${oldIds.length} accounts.)`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seed().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { assertLocalDatabase, DEMO_DOMAIN };
