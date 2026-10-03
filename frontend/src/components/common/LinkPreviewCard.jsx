import './LinkPreviewCard.css';
import { useLinkPreview } from '../../hooks/useLinkPreview';
import { displayHost } from '../../utils/links';
import { safeHttpUrl } from '../../utils/safeUrl';

// Day 19: a card for the first link in a post or message -- site, title
// and description, fetched by our server (the reader's browser never
// contacts the site until they click). Deliberately no image: showing the
// site's og:image would load it from the site, telling it who is reading.
// Renders nothing until a preview exists, and nothing at all if there is
// none -- a link without a card is still a link in the text.
function LinkPreviewCard({ url, className = '' }) {
  const preview = useLinkPreview(url);
  const href = safeHttpUrl(preview?.url);
  if (!preview || !href) return null;
  const site = preview.siteName || displayHost(href);
  return (
    <a
      className={`post-card-link-preview ${className}`.trim()}
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="post-card-link-preview-text">
        {site && <span className="post-card-link-preview-domain" dir="auto">{site}</span>}
        <span className="post-card-link-preview-title" dir="auto">{preview.title}</span>
        {preview.description && <span className="post-card-link-preview-subtitle" dir="auto">{preview.description}</span>}
      </div>
    </a>
  );
}

export default LinkPreviewCard;
