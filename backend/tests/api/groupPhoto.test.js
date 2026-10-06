const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 34: a group chat's photo -- admins set or remove it; the old file is
// deleted from Cloudinary then, and when the group itself goes.
describe('group photo (Day 34)', () => {
  const { app, reset } = setupTestApp();
  const cloudinary = require('../../config/cloudinary'); // the setupTestApp mock
  const CLOUD_ENV = { CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' };
  const saved = {};
  beforeAll(() => { for (const [k, v] of Object.entries(CLOUD_ENV)) { saved[k] = process.env[k]; process.env[k] = v; } });
  afterAll(() => { for (const k of Object.keys(CLOUD_ENV)) process.env[k] = saved[k]; });

  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const setPhoto = (user, id, file = png, type = 'image/png') =>
    request(app).put(`/conversations/${id}/photo`).set(auth(user)).attach('photo', file, { filename: 'g.png', contentType: type });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  const deletedIds = () => cloudinary.api.delete_resources.mock.calls.flatMap(([ids]) => ids);
  const idOf = (url) => url.match(/upload\/v\d+\/(.+)\.\w+$/)[1];

  let owner;
  let member;
  let group;
  beforeEach(async () => {
    await reset();
    cloudinary.api.delete_resources.mockClear();
    owner = await registerAndLogin(app);
    member = await registerAndLogin(app);
    group = (await request(app).post('/conversations/groups').set(auth(owner)).send({ name: 'Hikers', userIds: [member.id] })).body;
  });

  it('an admin sets the photo; everyone sees it in the details and the inbox', async () => {
    const res = await setPhoto(owner, group.id);
    expect(res.status).toBe(200);
    expect(res.body.avatar_url).toMatch(/^https:\/\/res\.cloudinary\.com\/test\/image\/upload\/v\d+\/group-photos\//);
    expect((await request(app).get(`/conversations/${group.id}`).set(auth(member))).body.avatar_url).toBe(res.body.avatar_url);
    const inbox = (await request(app).get('/conversations').set(auth(member))).body;
    expect(inbox.find((c) => c.conversation_id === group.id).avatar_url).toBe(res.body.avatar_url);
  });

  it('a member can\'t, and nothing is uploaded for them', async () => {
    const spy = jest.spyOn(cloudinary.uploader, 'upload_stream');
    expect((await setPhoto(member, group.id)).status).toBe(403);
    expect((await request(app).delete(`/conversations/${group.id}/photo`).set(auth(member))).status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('someone outside the group can\'t either (403), and not for direct chats (400)', async () => {
    const outsider = await registerAndLogin(app);
    expect((await setPhoto(outsider, group.id)).status).toBe(403);
    const direct = (await request(app).post('/conversations').set(auth(owner)).send({ userId: member.id })).body;
    expect((await setPhoto(owner, direct.id)).status).toBe(400);
  });

  it('needs an image file (400)', async () => {
    expect((await request(app).put(`/conversations/${group.id}/photo`).set(auth(owner))).status).toBe(400);
    expect((await setPhoto(owner, group.id, Buffer.from('#!/bin/sh'), 'text/x-sh')).status).toBe(400);
  });

  it('replacing or removing the photo deletes the old file', async () => {
    const first = (await setPhoto(owner, group.id)).body.avatar_url;
    const second = (await setPhoto(owner, group.id)).body.avatar_url;
    await settle();
    expect(deletedIds()).toEqual([idOf(first)]);
    const removed = await request(app).delete(`/conversations/${group.id}/photo`).set(auth(owner));
    expect(removed.status).toBe(200);
    expect(removed.body.avatar_url).toBeNull();
    await settle();
    expect(deletedIds()).toEqual([idOf(first), idOf(second)]);
    expect((await request(app).get(`/conversations/${group.id}`).set(auth(owner))).body.avatar_url).toBeNull();
  });

  it('when the last person leaves, the group and its photo go', async () => {
    const photo = (await setPhoto(owner, group.id)).body.avatar_url;
    await request(app).delete(`/conversations/${group.id}/members/${member.id}`).set(auth(member));
    await request(app).delete(`/conversations/${group.id}/members/${owner.id}`).set(auth(owner));
    await settle();
    expect(deletedIds()).toContain(idOf(photo));
  });
});
