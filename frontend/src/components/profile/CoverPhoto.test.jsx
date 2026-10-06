import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import CoverPhoto from './CoverPhoto';

// Day 36: a profile's cover banner.
describe('CoverPhoto', () => {
  it('shows the photo at a size for the column, decorative', () => {
    const { container } = render(<CoverPhoto src="https://res.cloudinary.com/demo/image/upload/v1/covers/c.jpg" />);
    const img = container.querySelector('.profile-cover img');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('src')).toContain('/upload/f_auto,q_auto,w_960,c_limit/v1/covers/c.jpg');
    expect(img.getAttribute('srcset')).toContain('1440w');
    expect(container.querySelector('.profile-cover-empty')).toBeNull();
  });

  it('without a photo: the plain band, no image', () => {
    const { container } = render(<CoverPhoto src={null} />);
    expect(container.querySelector('.profile-cover-empty')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
});
