import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { setLanguage } from '../i18n';
import SettingsScreen from './SettingsScreen';
import HelpScreen from './HelpScreen';
import AboutScreen from './AboutScreen';

vi.mock('../hooks/useUnreadCount', () => ({ useUnreadCount: () => ({ unreadCount: 0 }) }));
vi.mock('../hooks/useCurrentUserSummary', () => ({ useCurrentUserSummary: () => ({ username: 'alice', avatarUrl: null, isAdmin: false }) }));
vi.mock('../hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: () => {} }) }));
vi.mock('../components/common/PrivacyToggle', () => ({ default: () => null }));

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}
const settings = () => render(
  <MemoryRouter initialEntries={['/settings']}>
    <Routes>
      <Route path="/settings" element={<SettingsScreen />} />
      <Route path="*" element={<Where />} />
    </Routes>
  </MemoryRouter>
);

beforeEach(async () => {
  localStorage.setItem('token', 'tok');
  localStorage.setItem('userId', '7');
  await setLanguage('en');
});

// Day 60 (AUDIT_REPORT_3 A2): the only "Coming soon" rows left are the
// paused features.
describe('Settings rows', () => {
  it('only the paused features (Reels, Live) are still disabled', () => {
    settings();
    const disabled = screen.getAllByRole('button').filter((b) => b.disabled && b.classList.contains('settings-row'));
    expect(disabled.map((b) => b.textContent)).toEqual(['Reels & Videos', 'Live Streaming']);
    for (const gone of ['Who Can See My Content', 'Content Preferences', 'News Feed Settings', 'Story Settings']) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  it.each([
    ['Followers & Following', '/profile/7/connections?tab=followers'],
    ['Help & Support', '/help'],
    ['About MySocialApp', '/about']
  ])('%s opens %s', async (row, path) => {
    settings();
    await userEvent.click(screen.getByRole('button', { name: row }));
    expect(screen.getByTestId('where')).toHaveTextContent(path);
  });
});

describe('Help and About', () => {
  it('Help lists the answers, in Arabic too', async () => {
    render(<MemoryRouter><HelpScreen /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: 'Help & Support' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBe(10);
    expect(screen.getByRole('heading', { name: 'How do I report something?' })).toBeInTheDocument();
    // Day 102: the first day's limits, explained.
    expect(screen.getByRole('heading', { name: "Why can't I post, follow or message more right now?" })).toBeInTheDocument();
    // Day 106: how a page gets the blue tick.
    expect(screen.getByRole('heading', { name: 'How does a page get the blue tick?' })).toBeInTheDocument();
    await setLanguage('ar');
    expect(await screen.findByRole('heading', { level: 1, name: 'المساعدة والدعم' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBe(10);
    expect(screen.getByRole('heading', { name: 'لماذا لا يمكنني النشر أو المتابعة أو المراسلة أكثر الآن؟' })).toBeInTheDocument();
  });

  it('About names both languages and links Terms, Privacy and Help', () => {
    render(<MemoryRouter><AboutScreen /></MemoryRouter>);
    expect(screen.getByText('العربية')).toHaveAttribute('lang', 'ar');
    expect(screen.getByText('English')).toHaveAttribute('lang', 'en');
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/terms', '/privacy', '/help']);
  });
});
