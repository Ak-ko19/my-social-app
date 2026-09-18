// Centralizes the localStorage-based auth read so every component that
// needs the current user's token/id/name doesn't repeat this lookup.
// `username` is only present for sessions that logged in after this field
// was added (Step 5) -- callers should fall back gracefully if it's null.
export function useAuth() {
  const token = localStorage.getItem('token');
  const userId = parseInt(localStorage.getItem('userId'), 10);
  const username = localStorage.getItem('username') || null;
  return { token, userId, username };
}
