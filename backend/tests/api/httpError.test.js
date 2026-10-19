const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');

// Day 69: one error type. Each area's errors are HttpErrors with a fixed
// status (what the old per-controller instanceof chains used to send), and
// every handler ends with sendError.
describe('HttpError and sendError', () => {
  // The test database stands in for db.js: a 500 is recorded in the error log.
  setupTestApp();
  const { HttpError, sendError } = require('../../utils/httpError');
  const messageService = require('../../services/messageService');
  const STATUS = [
    [messageService.MessageValidationError, ['x'], 400],
    [messageService.NotParticipantError, [], 403],
    [messageService.BlockedError, [], 403],
    [messageService.NotMessageOwnerError, [], 403],
    [messageService.NotEditableError, [], 403],
    [messageService.MessageNotFoundError, [], 404],
    [messageService.RateLimitError, [], 429],
    [require('../../services/interactionService').InteractionError, ['x'], 403],
    [require('../../services/spamService').SpamError, ['x'], 429],
    [require('../../services/uploadQuotaService').UploadLimitError, [], 429],
    [require('../../services/postCreationService').PostInputError, [409, 'x'], 409],
    [require('../../services/pollService').PollError, [404, 'x'], 404],
    [require('../../services/collectionService').CollectionError, [400, 'x'], 400],
    [require('../../services/communityService').GroupRuleError, [403, 'x'], 403]
  ];

  it.each(STATUS.map(([Type, args, status]) => [Type.name, status, Type, args]))('%s is an HttpError with status %i', (name, status, Type, args) => {
    const err = new Type(...args);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(status);
    expect(err.name).toBe(name);
    expect(err.message).toBeTruthy();
  });

  it('sends an HttpError as its status and message (text), anything else as a 500 with the fallback', async () => {
    const app = express();
    app.get('/http', (req, res) => sendError(res, new HttpError(409, 'Already done'), 'Fallback'));
    app.get('/bug', (req, res) => sendError(res, new Error('database password is wrong'), 'Loading failed. Please try again later.'));
    const http = await request(app).get('/http');
    expect([http.status, http.text]).toEqual([409, 'Already done']);
    const bug = await request(app).get('/bug');
    expect([bug.status, bug.text]).toEqual([500, 'Loading failed. Please try again later.']); // never the real message
  });

  it("controllers and routes end their handlers with sendError, never their own error dispatch", () => {
    const dirs = ['controllers', 'routes'].map((d) => path.join(__dirname, '../..', d));
    const offenders = dirs.flatMap((dir) => fs.readdirSync(dir).map((f) => path.join(dir, f)))
      .filter((file) => /sendServerError\(|instanceof \w+Error\) return res\.status\(err\.status\)/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.basename(file));
    expect(offenders).toEqual([]);
  });
});
