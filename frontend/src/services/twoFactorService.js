import api from '../api';

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Day 77: two-factor authentication (backend routes/twoFactorRoutes.js).
// -> { enabled, enabledAt, recoveryCodesLeft }
export function fetchTwoFactorStatus(token) {
  return api.get('/2fa', authHeaders(token)).then((res) => res.data);
}

// -> { secret, otpauthUrl, qr } (qr: an SVG data URL)
export function startTwoFactorSetup(password, token) {
  return api.post('/2fa/setup', { password }, authHeaders(token)).then((res) => res.data);
}

// -> the recovery codes (shown once)
export function enableTwoFactor(code, token) {
  return api.post('/2fa/enable', { code }, authHeaders(token)).then((res) => res.data.recoveryCodes);
}

// secondFactor: { code } or { recoveryCode }
export function disableTwoFactor(password, secondFactor, token) {
  return api.post('/2fa/disable', { password, ...secondFactor }, authHeaders(token)).then((res) => res.data);
}

export function regenerateRecoveryCodes(password, token) {
  return api.post('/2fa/recovery-codes', { password }, authHeaders(token)).then((res) => res.data.recoveryCodes);
}
