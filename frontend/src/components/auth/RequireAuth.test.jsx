import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import RequireAuth from './RequireAuth';
import { clearLocalSession } from '../../hooks/useAuth';
import { safeReturnPath } from '../../utils/returnPath';

// Day 30 (AUDIT_REPORT_2 N1): account-only screens send logged-out
// visitors to Login, remembering where they were going.
function LoginProbe() {
  const location = useLocation();
  return <p>login page, from={location.state?.from ?? 'none'}</p>;
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginProbe />} />
        <Route path="/settings/account" element={<RequireAuth><p>account screen</p></RequireAuth>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireAuth', () => {
  it('shows the screen when logged in', () => {
    localStorage.setItem('token', 'tok');
    renderAt('/settings/account');
    expect(screen.getByText('account screen')).toBeInTheDocument();
  });

  it('sends a logged-out visitor to Login, remembering the page (with its query)', () => {
    renderAt('/settings/account?tab=password');
    expect(screen.queryByText('account screen')).not.toBeInTheDocument();
    expect(screen.getByText('login page, from=/settings/account?tab=password')).toBeInTheDocument();
  });

  it('a logout while on the screen also lands on Login', () => {
    localStorage.setItem('token', 'tok');
    renderAt('/settings/account');
    act(() => clearLocalSession());
    expect(screen.getByText('login page, from=/settings/account')).toBeInTheDocument();
  });
});

describe('safeReturnPath', () => {
  it('returns paths inside the app', () => {
    expect(safeReturnPath('/messages/4')).toBe('/messages/4');
    expect(safeReturnPath('/settings/account?tab=x')).toBe('/settings/account?tab=x');
  });

  it('falls back to Home for anything else', () => {
    for (const bad of [undefined, null, 42, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/login', '/login?x=1']) {
      expect(safeReturnPath(bad)).toBe('/');
    }
  });
});
