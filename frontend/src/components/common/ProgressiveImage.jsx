import { useState } from 'react';
import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { getOptimizedImageUrl, getPlaceholderImageUrl, getSrcSet, isCloudinaryUrl } from '../../utils/cloudinaryImage';
import { DURATION_NORMAL, EASE_STANDARD } from '../../utils/motionTokens';
import { useTranslation } from 'react-i18next';

// Generic progressive-loading image: reserves `aspectRatio` up front (no
// layout shift regardless of loading/loaded/error state), shows a blurred
// low-res Cloudinary placeholder immediately, and crossfades in the
// optimized full image once it loads (opacity only, driven by Motion so the
// same easing/duration tokens apply consistently across the Feed). Falls
// back to a plain (still lazy-loaded) image for non-Cloudinary URLs, since
// there's nothing to transform there.
//
// Day 27: also offers the image at several widths (srcset); `sizes` says how
// wide it renders -- the app column is at most 480px -- so a phone gets a
// sharp image for its pixel density and nobody downloads more than needed.
const WIDTHS = [320, 480, 640, 960, 1440];
const COLUMN_SIZES = '(max-width: 480px) 100vw, 480px';

function ProgressiveImage({ src, alt, width = 640, sizes = COLUMN_SIZES, aspectRatio = '4 / 3', className = '' }) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const reduceMotion = useReducedMotion();

  if (!src) return null;

  if (errored) {
    return (
      <div
        className={`feed-progressive-image feed-progressive-image-error ${className}`.trim()}
        style={{ aspectRatio }}
      >
        <span className="feed-visually-hidden">{alt}</span>
        <span aria-hidden="true">{t('media.unavailable')}</span>
      </div>
    );
  }

  const fullSrc = getOptimizedImageUrl(src, width);
  const placeholderSrc = isCloudinaryUrl(src) ? getPlaceholderImageUrl(src) : null;

  return (
    <div className={`feed-progressive-image ${className}`.trim()} style={{ aspectRatio }}>
      {placeholderSrc && (
        <img className="feed-progressive-image-placeholder" src={placeholderSrc} alt="" aria-hidden="true" />
      )}
      <m.img
        className="feed-progressive-image-full"
        src={fullSrc}
        srcSet={getSrcSet(src, WIDTHS) || undefined}
        sizes={isCloudinaryUrl(src) ? sizes : undefined}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        initial={false}
        animate={{ opacity: loaded ? 1 : 0 }}
        transition={{ duration: reduceMotion ? 0 : DURATION_NORMAL, ease: EASE_STANDARD }}
      />
    </div>
  );
}

export default ProgressiveImage;
