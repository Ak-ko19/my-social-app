import ProgressiveImage from '../common/ProgressiveImage';

function PostMedia({ src, alt = 'Post attachment' }) {
  if (!src) return null;
  return <ProgressiveImage src={src} alt={alt} width={640} className="feed-post-media" />;
}

export default PostMedia;
