// Manual Jest mock for the 'sanitize-html' package. The real package pulls
// in an ESM-only version of htmlparser2 that Jest's CJS runtime can't
// require() (unrelated to this app's own code) -- this reimplements just
// the one call shape actually used in the codebase
// (services/messageService.js: sanitizeHtml(raw, { allowedTags: [],
// allowedAttributes: {} })), a full tag-strip, so DM XSS-prevention
// behavior is still meaningfully exercised in tests rather than mocked
// away as a no-op passthrough.
module.exports = function sanitizeHtml(html, options = {}) {
  const input = html || '';
  if (Array.isArray(options.allowedTags) && options.allowedTags.length === 0) {
    // Real sanitize-html's default nonTextTags list (script/style/etc.)
    // removes the tag AND its inner text, not just the tag markup --
    // every other disallowed tag just gets unwrapped, keeping its text.
    // Matches that distinction so this mock's XSS-stripping behavior is
    // meaningfully representative, not just superficially similar.
    const withoutNonTextTags = input.replace(/<(script|style|textarea|option)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
    return withoutNonTextTags.replace(/<[^>]*>/g, '');
  }
  // No other call site in this codebase uses a non-empty allowedTags list;
  // fail loudly instead of silently returning wrong output if one is added.
  throw new Error('sanitize-html mock only supports allowedTags: [] (full tag-strip) -- extend the mock if a new caller needs more.');
};
