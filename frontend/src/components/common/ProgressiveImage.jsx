import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { getOptimizedImageUrl, getPlaceholderImageUrl, isCloudinaryUrl } from '../../utils/cloudinaryImage';
import { DURATION_NORMAL, EASE_STANDARD } from '../../utils/motionTokens';

// Generic progressive-loading image: reserves `aspectRatio` up front (no
// layout shift regardless of loading/loaded/error state), shows a blurred
// low-res Cloudinary placeholder immediately, and crossfades in the
// optimized full image once it loads (opacity only, driven by Motion so the
// same easing/duration tokens apply consistently across the Feed). Falls
// back to a plain (still lazy-loaded) image for non-Cloudinary URLs, since
// there's nothing to transform there.
function ProgressiveImage({ src, alt, width = 640, aspectRatio = '4 / 3', className = '' }) {
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
        <span aria-hidden="true">Image unavailable</span>
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
      <motion.img
        className="feed-progressive-image-full"
        src={fullSrc}
        alt={alt}
        loading="lazy"
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
