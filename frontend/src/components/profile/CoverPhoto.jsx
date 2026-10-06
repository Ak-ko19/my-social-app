import { getOptimizedImageUrl, getSrcSet } from '../../utils/cloudinaryImage';
import { resolveImageUrl } from '../../api';
import './CoverPhoto.css';

// Day 36: a profile's cover -- a 3:1 banner (the photo, or a soft accent
// band when there is none). Decorative: the profile's name is right below.
function CoverPhoto({ src, className = '' }) {
  const url = resolveImageUrl(src);
  return (
    <div className={`profile-cover ${url ? '' : 'profile-cover-empty'} ${className}`.trim()}>
      {url && (
        <img
          src={getOptimizedImageUrl(url, 960)}
          srcSet={getSrcSet(url, [480, 960, 1440]) || undefined}
          sizes="(max-width: 480px) 100vw, 480px"
          alt=""
          decoding="async"
        />
      )}
    </div>
  );
}

export default CoverPhoto;
