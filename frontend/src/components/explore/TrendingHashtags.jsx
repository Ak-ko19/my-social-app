import { Link } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import './Explore.css';

// Trending hashtag chips (B7) -- shared by the Explore screen and the
// Search screen's "before you search" state. Renders nothing until loaded,
// and an honest empty line when nothing is trending this week.
function TrendingHashtags({ tags, loaded, title = 'Trending this week' }) {
  if (!loaded) return null;
  return (
    <section className="trending" aria-label={title}>
      <h2 className="section-heading trending-heading">
        <TrendingUp size={14} aria-hidden="true" /> {title}
      </h2>
      {tags.length === 0 ? (
        <p className="trending-empty">Nothing trending yet this week.</p>
      ) : (
        <ul className="trending-chips">
          {tags.map((t) => (
            <li key={t.tag}>
              <Link to={`/hashtag/${encodeURIComponent(t.tag)}`} className="trending-chip">
                <span>#{t.tag}</span>
                <span className="trending-chip-count">
                  {t.post_count} {t.post_count === 1 ? 'post' : 'posts'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default TrendingHashtags;
