import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProfileDetails from './ProfileDetails';
import { linkLabel } from '../../utils/linkLabel';
import { formatDate, setLanguage } from '../../i18n';

// Day 36: links and joined date on a profile.
describe('ProfileDetails', () => {
  afterEach(() => setLanguage('en'));

  it('shows each link as a safe outbound link with a short label', () => {
    render(<ProfileDetails links={['https://www.example.com/', 'https://shop.example.org/tea?x=1']} joinedAt="2026-03-15T10:00:00Z" />);
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['example.com', 'shop.example.org/tea?x=1']);
    for (const a of links) {
      expect(a).toHaveAttribute('target', '_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer nofollow ugc');
    }
    expect(screen.getByText('Joined March 2026')).toBeInTheDocument();
  });

  it('never puts a non-web URL into an href, even if one were stored', () => {
    render(<ProfileDetails links={['javascript:alert(1)', 'https://ok.example/']} joinedAt={null} />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://ok.example/');
    expect(screen.queryByText(/Joined/)).toBeNull();
  });

  it('no links: no list', () => {
    render(<ProfileDetails links={[]} joinedAt="2026-03-15T10:00:00Z" />);
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('long labels are shortened', () => {
    expect(linkLabel(`https://example.com/${'a'.repeat(60)}`)).toHaveLength(40);
  });

  it('monthYear dates in English and Burmese', async () => {
    expect(formatDate('2026-03-15T10:00:00Z', 'monthYear')).toBe('March 2026');
    await setLanguage('my');
    expect(formatDate('2026-03-15T10:00:00Z', 'monthYear')).toBe('၂၀၂၆ မတ်');
  });
});
