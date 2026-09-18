import { resolveImageUrl } from '../../api';

function PostMedia({ src, alt = 'Post attachment' }) {
  if (!src) return null;

  return <img className="feed-post-media" src={resolveImageUrl(src)} alt={alt} loading="lazy" />;
}

export default PostMedia;
