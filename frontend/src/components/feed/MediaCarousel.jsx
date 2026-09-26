import { useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import ProgressiveImage from '../common/ProgressiveImage';

// A post's images (B2). One image renders exactly like before (a single
// ProgressiveImage); several become a swipeable carousel built on native
// CSS scroll-snap -- touch swiping, momentum and trackpad scrolling come
// from the browser, no gesture library needed. Prev/next buttons, a
// counter and dots cover mouse users; Left/Right arrows work when the
// track is focused.
function MediaCarousel({ media, altPrefix = 'Post image', className }) {
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  if (!media || media.length === 0) return null;

  if (media.length === 1) {
    return <ProgressiveImage src={media[0].url} alt={altPrefix} className={className} />;
  }

  const count = media.length;

  const goTo = (target) => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(count - 1, target));
    track.scrollTo({ left: next * track.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  // The scroll position is the source of truth (a swipe changes it without
  // any click), so the visible index is derived from it.
  const handleScroll = () => {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    const next = Math.round(track.scrollLeft / track.clientWidth);
    if (next !== index) setIndex(next);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(index - 1);
    }
  };

  return (
    <div
      className={clsx('media-carousel', className)}
      role="region"
      aria-roledescription="carousel"
      aria-label={`${altPrefix}s, ${count} images`}
    >
      <div
        ref={trackRef}
        className="media-carousel-track"
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        aria-label="Swipe or use arrow keys to see more images"
      >
        {media.map((item, i) => (
          <div
            key={`${item.url}-${i}`}
            className="media-carousel-slide"
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
          >
            <ProgressiveImage src={item.url} alt={`${altPrefix} ${i + 1} of ${count}`} />
          </div>
        ))}
      </div>

      <span className="media-carousel-counter" aria-hidden="true">
        {index + 1}/{count}
      </span>

      {index > 0 && (
        <button type="button" className="media-carousel-nav media-carousel-prev" aria-label="Previous image" onClick={() => goTo(index - 1)}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
      )}
      {index < count - 1 && (
        <button type="button" className="media-carousel-nav media-carousel-next" aria-label="Next image" onClick={() => goTo(index + 1)}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}

      <div className="media-carousel-dots" aria-hidden="true">
        {media.map((item, i) => (
          <span key={`${item.url}-dot-${i}`} className={clsx('media-carousel-dot', i === index && 'media-carousel-dot-active')} />
        ))}
      </div>
    </div>
  );
}

export default MediaCarousel;
