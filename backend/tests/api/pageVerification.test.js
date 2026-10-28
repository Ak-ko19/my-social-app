const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 106: page verification requests -- a page's managers ask, an admin
// approves or declines, the tick shows wherever the page's name does.
describe('page verification (Day 106)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const state = (user, pageId) => request(app).get(`/pages/${pageId}/verification`).set(auth(user));
  const ask = (user, pageId, body) => request(app).post(`/pages/${pageId}/verification`).set(auth(user)).send(body);
  const queue = (user, query = {}) => request(app).get('/admin/page-verifications').query(query).set(auth(user));
  const approve = (user, id) => request(app).post(`/admin/page-verifications/${id}/approve`).set(auth(user));
  const decline = (user, id, reason) => request(app).post(`/admin/page-verifications/${id}/decline`).set(auth(user)).send({ reason });
  const unverify = (user, pageId, reason) => request(app).post(`/admin/pages/${pageId}/unverify`).set(auth(user)).send({ reason });
  const notes = async (type) => (await pool.query('SELECT user_id, actor_id, page_id, details FROM notifications WHERE type = $1 ORDER BY user_id', [type])).rows;
  const logRows = async () => (await pool.query("SELECT admin_id, action, target_type, target_id, target_label, details FROM admin_actions WHERE target_type = 'page' ORDER BY id")).rows;

  let admin;
  let owner;
  let helper;
  let stranger;
  let page;
  beforeEach(async () => {
    admin = await registerAndLogin(app);
    owner = await registerAndLogin(app);
    helper = await registerAndLogin(app);
    stranger = await registerAndLogin(app);
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.id]);
    page = (await request(app).post('/pages').set(auth(owner)).send({ name: 'Rangoon Tea House', category: 'business', description: 'Tea and snacks since 1990' })).body;
    await request(app).post(`/pages/${page.id}/admins`).set(auth(owner)).send({ username: helper.username });
  });

  it("the page's owner or admins ask: the About text first, a note, an optional http(s) link; one at a time; they can withdraw it", async () => {
    await request(app).patch(`/pages/${page.id}`).set(auth(owner)).send({ description: '' });
    const blank = (await state(owner, page.id)).body;
    expect(blank).toMatchObject({ verified_at: null, request: null, removed: null, can_request: false, why_not: 'no_about', next_request_at: null });
    expect((await ask(owner, page.id, { note: 'The official page' })).text).toBe('Add an About text to the page first.');
    await request(app).patch(`/pages/${page.id}`).set(auth(owner)).send({ description: 'Tea and snacks since 1990' });
    expect((await state(owner, page.id)).body).toMatchObject({ can_request: true, why_not: null });

    expect((await ask(owner, page.id, { note: '   ' })).status).toBe(400);
    expect((await ask(owner, page.id, { note: ['x'] })).text).toBe('Tell us who this page represents.');
    expect((await ask(owner, page.id, { note: 'x'.repeat(501) })).text).toBe('The note must be 500 characters or fewer.');
    for (const link of ['javascript:alert(1)', 'not a url', `https://example.com/${'a'.repeat(300)}`, { href: 'https://x.y' }]) {
      const res = await ask(owner, page.id, { note: 'The official page', link });
      expect([res.status, res.text]).toEqual([400, 'Enter a web address that starts with http:// or https://, up to 300 characters.']);
    }
    expect((await ask(stranger, page.id, { note: 'Mine now' })).status).toBe(403);
    expect((await state(stranger, page.id)).status).toBe(403);

    const sent = await ask(helper, page.id, { note: '  We are the tea house on 19th Street  ', link: 'https://rangoontea.example' });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ can_request: false, why_not: 'pending', request: { status: 'pending', note: 'We are the tea house on 19th Street', link: 'https://rangoontea.example', decline_reason: null } });
    expect((await ask(owner, page.id, { note: 'Again' })).text).toBe('This page already has a request waiting for review.');
    expect((await state(owner, page.id)).body.request.id).toBe(sent.body.request.id);

    const withdrawn = await request(app).delete(`/pages/${page.id}/verification`).set(auth(owner));
    expect(withdrawn.body).toMatchObject({ request: null, can_request: true });
    expect((await request(app).delete(`/pages/${page.id}/verification`).set(auth(owner))).status).toBe(200);
    expect((await request(app).delete(`/pages/${page.id}/verification`).set(auth(stranger))).status).toBe(403);
  });

  it('an admin sees the waiting requests (oldest first) with the page; approving gives the tick everywhere, logs it and tells the managers', async () => {
    const other = (await request(app).post('/pages').set(auth(stranger)).send({ name: 'Other page', description: 'About' })).body;
    const first = (await ask(owner, page.id, { note: 'Official' })).body.request;
    const second = (await ask(stranger, other.id, { note: 'Ours' })).body.request;
    await request(app).post(`/pages/${page.id}/follow`).set(auth(stranger));
    const pagePost = (await request(app).post('/posts').set(auth(owner)).field('content', 'Fresh tea').field('pageId', String(page.id))).body;

    expect((await queue(owner)).status).toBe(404);
    const list = (await queue(admin)).body;
    expect(list.requests.map((r) => r.id)).toEqual([first.id, second.id]);
    expect(list.requests[0]).toMatchObject({
      note: 'Official', requested_by_username: owner.username, other_declines: 0,
      page: { id: page.id, name: 'Rangoon Tea House', owner_username: owner.username, follower_count: 1, post_count: 1, verified_at: null }
    });

    expect((await approve(owner, first.id)).status).toBe(404);
    expect((await approve(admin, 999999)).status).toBe(404);
    expect((await approve(admin, first.id)).body).toEqual({ id: first.id, status: 'approved' });
    expect((await approve(admin, first.id)).text).toBe('This request has already been decided.');
    expect((await decline(admin, first.id, 'other')).status).toBe(409);

    expect((await request(app).get(`/pages/${page.id}`).set(auth(stranger))).body.is_verified).toBe(true);
    expect((await request(app).get(`/pages/${other.id}`).set(auth(stranger))).body.is_verified).toBe(false);
    const posts = (await request(app).get(`/pages/${page.id}/posts`).set(auth(stranger))).body.posts;
    expect(posts.find((p) => p.id === pagePost.id).page).toEqual({ id: page.id, name: 'Rangoon Tea House', verified: true });
    expect((await state(owner, page.id)).body).toMatchObject({ why_not: 'verified', can_request: false, removed: null, request: { status: 'approved' } });
    expect((await ask(owner, page.id, { note: 'More' })).text).toBe('This page is already verified.');

    expect(await logRows()).toEqual([{ admin_id: admin.id, action: 'page_verified', target_type: 'page', target_id: String(page.id), target_label: 'Rangoon Tea House', details: { requestId: first.id } }]);
    expect(await notes('page_verified')).toEqual([owner.id, helper.id].sort((a, b) => a - b).map((id) => ({ user_id: id, actor_id: id, page_id: page.id, details: null })));
    const shown = (await request(app).get('/notifications').set(auth(helper))).body.notifications.find((n) => n.type === 'page_verified');
    expect(shown).toMatchObject({ page_id: page.id, page_name: 'Rangoon Tea House' });

    expect((await queue(admin)).body.requests.map((r) => r.id)).toEqual([second.id]);
    const reviewed = (await queue(admin, { status: 'reviewed' })).body.requests;
    expect(reviewed).toEqual([expect.objectContaining({ id: first.id, status: 'approved', decided_by_username: admin.username })]);
    expect((await queue(admin, { status: 'nope' })).status).toBe(400);
    expect((await queue(admin, { page: 0 })).status).toBe(400);
  });

  it('declining needs a reason, which the managers are told; the page waits 30 days to ask again', async () => {
    const sent = (await ask(owner, page.id, { note: 'Official' })).body.request;
    expect((await decline(admin, sent.id, 'because')).text).toBe('reason must be one of: incomplete, not_notable, impersonation, other');
    expect((await decline(admin, sent.id, undefined)).status).toBe(400);
    expect((await decline(admin, sent.id, 'not_notable')).body).toEqual({ id: sent.id, status: 'declined', decline_reason: 'not_notable' });
    expect((await request(app).get(`/pages/${page.id}`).set(auth(owner))).body.is_verified).toBe(false);

    const after = (await state(helper, page.id)).body;
    expect(after).toMatchObject({ can_request: false, why_not: 'wait', request: { status: 'declined', decline_reason: 'not_notable' } });
    const days = (new Date(after.next_request_at) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
    expect((await ask(owner, page.id, { note: 'Please' })).text).toBe('A page can ask again 30 days after a request is declined or a tick is removed.');
    expect((await notes('page_not_verified')).map((n) => [n.user_id, n.details])).toEqual(
      [owner.id, helper.id].sort((a, b) => a - b).map((id) => [id, { reason: 'not_notable' }])
    );
    expect((await logRows()).map((r) => [r.action, r.details])).toEqual([['page_declined', { requestId: sent.id, reason: 'not_notable' }]]);

    await pool.query("UPDATE page_verification_requests SET decided_at = now() - interval '31 days'");
    expect((await state(owner, page.id)).body).toMatchObject({ can_request: true, why_not: null, next_request_at: null });
    const again = (await ask(owner, page.id, { note: 'We are notable now' })).body.request;
    expect((await queue(admin)).body.requests[0]).toMatchObject({ id: again.id, other_declines: 1 });
  });

  it('a new name loses the tick (the About text alone keeps it); an admin can take a tick away, with a reason and the same wait', async () => {
    const first = (await ask(owner, page.id, { note: 'Official' })).body.request;
    await approve(admin, first.id);
    await request(app).patch(`/pages/${page.id}`).set(auth(helper)).send({ description: 'New menu', name: 'Rangoon Tea House' });
    expect((await request(app).get(`/pages/${page.id}`).set(auth(owner))).body.is_verified).toBe(true);
    const renamed = await request(app).patch(`/pages/${page.id}`).set(auth(helper)).send({ name: 'Famous Brand Official' });
    expect(renamed.body.is_verified).toBe(false);
    expect((await state(owner, page.id)).body).toMatchObject({ removed: 'renamed', can_request: true, why_not: null });

    const second = (await ask(owner, page.id, { note: 'New name, same tea house' })).body.request;
    await approve(admin, second.id);
    expect((await unverify(admin, page.id, 'nope')).status).toBe(400);
    expect((await unverify(owner, page.id, 'impersonation')).status).toBe(404);
    expect((await unverify(admin, 999999, 'impersonation')).status).toBe(404);
    expect((await unverify(admin, page.id, 'impersonation')).body).toEqual({ id: page.id, verified_at: null });
    expect((await unverify(admin, page.id, 'impersonation')).text).toBe('This page is not verified.');
    expect((await state(owner, page.id)).body).toMatchObject({ removed: 'admin', can_request: false, why_not: 'wait' });
    expect((await notes('page_unverified')).map((n) => [n.user_id, n.page_id, n.details])).toEqual(
      [owner.id, helper.id].sort((a, b) => a - b).map((id) => [id, page.id, { reason: 'impersonation' }])
    );
    expect((await logRows()).map((r) => [r.action, r.target_label])).toEqual([
      ['page_verified', 'Rangoon Tea House'], ['page_verified', 'Famous Brand Official'], ['page_unverified', 'Famous Brand Official']
    ]);
    expect((await request(app).get('/admin/log').query({ action: 'page_unverified' }).set(auth(admin))).body.actions).toHaveLength(1);
  });

  it("the requests you sent are in your data export; they stay with the page when your account goes, and go with the page", async () => {
    await ask(helper, page.id, { note: 'Official', link: 'http://rangoontea.example' });
    const exported = (await request(app).get('/profile/export').set(auth(helper))).body;
    expect(exported.pages.verification_requests).toEqual([expect.objectContaining({ page_id: page.id, page_name: 'Rangoon Tea House', note: 'Official', link: 'http://rangoontea.example', status: 'pending' })]);
    await pool.query('DELETE FROM users WHERE id = $1', [helper.id]);
    expect((await queue(admin)).body.requests[0]).toMatchObject({ requested_by_username: null, note: 'Official' });
    await request(app).delete(`/pages/${page.id}`).set(auth(owner));
    expect((await queue(admin)).body.requests).toEqual([]);
  });
});
