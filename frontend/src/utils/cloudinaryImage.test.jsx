import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { getAvatarSources, getOptimizedImageUrl, getSrcSet } from './cloudinaryImage';
import Avatar from '../components/ui/Avatar';
import ProgressiveImage from '../components/common/ProgressiveImage';

// Day 27: images are fetched at the size they render at, never the upload.
const CLOUD = 'https://res.cloudinary.com/demo/image/upload/v1/posts/p1.jpg';
const LOCAL = '/uploads/old.jpg';

describe('Cloudinary image sizes', () => {
  it('builds a srcset of widths for a Cloudinary URL, and none for others', () => {
    expect(getSrcSet(CLOUD, [320, 640])).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_320,c_limit/v1/posts/p1.jpg 320w, '
      + 'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_640,c_limit/v1/posts/p1.jpg 640w'
    );
    expect(getSrcSet(LOCAL, [320])).toBeNull();
  });

  it('crops avatars square at 1x/2x/3x of their size', () => {
    const { src, srcSet } = getAvatarSources(CLOUD, 40);
    expect(src).toContain('/upload/f_auto,q_auto,w_80,h_80,c_fill/');
    expect(srcSet).toContain('w_40,h_40,c_fill/v1/posts/p1.jpg 1x');
    expect(srcSet).toContain('w_120,h_120,c_fill/v1/posts/p1.jpg 3x');
    expect(getAvatarSources(LOCAL, 40)).toEqual({ src: LOCAL, srcSet: undefined });
  });

  it('ui/Avatar loads a sized, lazy image', () => {
    const { container } = render(<Avatar src={CLOUD} size={36} initials="AB" />);
    const img = container.querySelector('img');
    expect(img.getAttribute('src')).toBe(getAvatarSources(CLOUD, 36).src);
    expect(img.getAttribute('srcset')).toContain('3x');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('width')).toBe('36');
  });

  it('feed images offer several widths sized to the 480px column', () => {
    const { container } = render(<ProgressiveImage src={CLOUD} alt="photo" />);
    const full = container.querySelector('img.feed-progressive-image-full');
    expect(full.getAttribute('src')).toBe(getOptimizedImageUrl(CLOUD, 640));
    expect(full.getAttribute('srcset')).toContain('w_1440,c_limit/v1/posts/p1.jpg 1440w');
    expect(full.getAttribute('sizes')).toBe('(max-width: 480px) 100vw, 480px');
    expect(full.getAttribute('loading')).toBe('lazy');
  });

  it('a non-Cloudinary feed image is left alone (no srcset)', () => {
    const { container } = render(<ProgressiveImage src={LOCAL} alt="old" />);
    const full = container.querySelector('img.feed-progressive-image-full');
    expect(full.getAttribute('src')).toBe(LOCAL);
    expect(full.hasAttribute('srcset')).toBe(false);
  });
});
