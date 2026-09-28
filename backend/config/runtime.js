// "Are we running in production?" in one place. Render doesn't set
// NODE_ENV by itself but always sets RENDER=true on its services, so either
// one counts.
function isProduction(env = process.env) {
  return env.NODE_ENV === 'production' || env.RENDER === 'true';
}

module.exports = { isProduction };
