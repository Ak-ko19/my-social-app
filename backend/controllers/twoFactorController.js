// Day 77: Settings > Two-factor authentication (services/twoFactorService.js).
const { sendError } = require('../utils/httpError');
const { textOf } = require('../utils/bodyText');
const twoFactor = require('../services/twoFactorService');

const secondFactor = (body) => ({ code: textOf(body?.code).trim(), recoveryCode: textOf(body?.recoveryCode).trim() });

async function getStatus(req, res) {
  try {
    res.json(await twoFactor.status(req.userId));
  } catch (err) {
    sendError(res, err, 'Could not load two-factor authentication. Please try again later.');
  }
}

async function setup(req, res) {
  try {
    await twoFactor.checkPassword(req.userId, textOf(req.body?.password));
    res.json(await twoFactor.startSetup(req.userId));
  } catch (err) {
    sendError(res, err, 'Could not set up two-factor authentication. Please try again later.');
  }
}

async function enable(req, res) {
  try {
    const recoveryCodes = await twoFactor.enable(req.userId, textOf(req.body?.code).trim());
    res.json({ recoveryCodes });
  } catch (err) {
    sendError(res, err, 'Could not turn on two-factor authentication. Please try again later.');
  }
}

async function disable(req, res) {
  try {
    await twoFactor.checkPassword(req.userId, textOf(req.body?.password));
    await twoFactor.disable(req.userId, secondFactor(req.body));
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, 'Could not turn off two-factor authentication. Please try again later.');
  }
}

async function regenerateRecoveryCodes(req, res) {
  try {
    await twoFactor.checkPassword(req.userId, textOf(req.body?.password));
    res.json({ recoveryCodes: await twoFactor.regenerateRecoveryCodes(req.userId) });
  } catch (err) {
    sendError(res, err, 'Could not make new recovery codes. Please try again later.');
  }
}

module.exports = { getStatus, setup, enable, disable, regenerateRecoveryCodes };
