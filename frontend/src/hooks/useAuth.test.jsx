import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { clearLocalSession, useAuth } from './useAuth';

describe('clearLocalSession', () => {
  it('forgets the session and tells mounted useAuth() consumers right away (no navigation)', () => {
    localStorage.setItem('token', 'tok');
    localStorage.setItem('userId', '7');
    localStorage.setItem('username', 'dave');
    localStorage.setItem('emailVerified', 'true');
    localStorage.setItem('lang', 'my'); // not part of the session
    const { result } = renderHook(() => useAuth());
    expect(result.current.token).toBe('tok');
    const href = window.location.href;

    act(() => clearLocalSession());

    expect(result.current.token).toBeNull();
    for (const key of ['token', 'userId', 'username', 'emailVerified']) expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem('lang')).toBe('my');
    expect(window.location.href).toBe(href);
  });
});
