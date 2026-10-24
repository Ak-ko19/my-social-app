// Day 80: the browser's words when a screen's code (a lazy chunk) can't be
// downloaded -- offline, or the files changed under us after a new
// version went live: Chromium, Firefox, Safari, Vite's preload helper.
const CHUNK_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError/i;

export function isChunkLoadError(error) {
  return CHUNK_ERROR.test(`${error?.name || ''} ${error?.message || ''}`);
}
