import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Avatar from './Avatar';

// Day 75: a decorative avatar adds nothing to its control's name or text.
describe('Avatar', () => {
  it('shows initials as text by default', () => {
    const { container } = render(<Avatar initials="AL" />);
    expect(container.textContent).toBe('AL');
    expect(container.firstChild).not.toHaveAttribute('aria-hidden');
  });

  it('decorative: hidden from assistive tech, initials drawn rather than text', () => {
    render(<button type="button" aria-label="Add to your story"><Avatar initials="AL" decorative /></button>);
    const button = screen.getByRole('button', { name: 'Add to your story' });
    expect(button.textContent).toBe('');
    const avatar = button.querySelector('.ui-avatar');
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    expect(avatar.querySelector('.ui-avatar-initials')).toHaveAttribute('data-initials', 'AL');
  });
});
