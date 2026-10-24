import { Link } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import './Explore.css';
import { useTranslation } from 'react-i18next';
import FeedErrorState from '../feed/FeedErrorState';

// Trending hashtag chips (B7) -- shared by the Explore screen and the
// Search screen's "before you search" state. Renders nothing until loaded,
// and an honest empty line when nothing is trending this week. Day 80: a
// failed load says so (with Try again) instead of "nothing trending".
function TrendingHashtags({ tags, loaded, failed = false, onRetry, title: titleProp }) {
  const { t } = useTranslation();
  const title = titleProp || t('explore.trending');
  if (!loaded) return null;
  return (
    <section className="trending" aria-label={title}>
      <h2 className="section-heading trending-heading">
        <TrendingUp size={14} aria-hidden="true" /> {title}
      </h2>
      {failed ? (
        <FeedErrorState message={t('explore.trendingFailed')} onRetry={onRetry} />
      ) : tags.length === 0 ? (
        <p className="trending-empty">{t('explore.trendingEmpty')}</p>
      ) : (
        <ul className="trending-chips">
          {tags.map((tag) => (
            <li key={tag.tag}>
              <Link to={`/hashtag/${encodeURIComponent(tag.tag)}`} className="trending-chip">
                <bdi>#{tag.tag}</bdi>
                <span className="trending-chip-count">
                  {t('explore.postCount', { count: tag.post_count })}
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
