// Centralizes the localStorage-based auth read so every component that
// needs the current user's token/id doesn't repeat this lookup — behavior
// is unchanged from the original inline `localStorage.getItem(...)` calls.
export function useAuth() {
  const token = localStorage.getItem('token');
  const userId = parseInt(localStorage.getItem('userId'), 10);
  return { token, userId };
}
