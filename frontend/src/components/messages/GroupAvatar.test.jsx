import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import GroupAvatar from './GroupAvatar';

// Day 34: a group's photo, or the group glyph when it has none.
describe('GroupAvatar', () => {
  it('shows the photo, sized, when there is one', () => {
    const { container } = render(<GroupAvatar src="https://res.cloudinary.com/demo/image/upload/v1/group-photos/g.jpg" size={40} />);
    const img = container.querySelector('img.messages-group-photo');
    expect(img).not.toBeNull();
    expect(img.getAttribute('width')).toBe('40');
    expect(img.getAttribute('alt')).toBe('');
  });

  it('shows the glyph (hidden from screen readers) when there is none', () => {
    const { container } = render(<GroupAvatar src={null} size={88} />);
    const glyph = container.querySelector('.messages-group-avatar');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(glyph.style.width).toBe('88px');
    expect(container.querySelector('img')).toBeNull();
  });
});
