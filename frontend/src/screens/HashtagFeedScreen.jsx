import { useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../components/ui';
import { useTranslation } from 'react-i18next';
import FeedList from '../components/feed/FeedList';
import FeedSkeleton from '../components/feed/FeedSkeleton';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useAuth } from '../hooks/useAuth';
import { useHashtagFeed } from '../hooks/useHashtagFeed';
import { arrowStep } from '../utils/direction';
import '../components/feed/Feed.css';
import '../components/profile/ProfileTabs.css';
import './HashtagFeedScreen.css';

// Day 40: Top (most engaging, with time decay) and Recent tabs, in the URL
// (?sort=) so a tab survives a reload and Back. Top first, like the big apps.
const SORTS = ['top', 'recent'];

function HashtagFeedScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { tag } = useParams();
  const [params, setParams] = useSearchParams();
  const sort = SORTS.includes(params.get('sort')) ? params.get('sort') : 'top';
  const tabRefs = useRef({});
  const { token } = useAuth();
  const { posts, loading, loadingMore, error, hasMore, loadMore, reload } = useHashtagFeed(tag, token, sort);

  const state = loading ? 'loading' : error ? 'error' : posts.length === 0 ? 'empty' : 'list';

  const select = (next) => {
    setParams({ sort: next }, { replace: true });
    tabRefs.current[next]?.focus();
  };
  const handleKeyDown = (e, index) => {
    const step = arrowStep(e.key);
    let next = null;
    if (step) next = (index + step + SORTS.length) % SORTS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = SORTS.length - 1;
    if (next !== null) {
      e.preventDefault();
      select(SORTS[next]);
    }
  };

  return (
    <div className="screen-enter">
      <header className="hashtag-feed-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.back')} onClick={() => navigate(-1)} />
        <h1 className="hashtag-feed-header-title"><bdi>#{tag}</bdi></h1>
      </header>
      <div role="tablist" aria-label={t('hashtag.sections')} className="profile-tablist">
        {SORTS.map((s, i) => (
          <button
            key={s}
            ref={(el) => { tabRefs.current[s] = el; }}
            type="button"
            role="tab"
            id={`hashtag-tab-${s}`}
            aria-selected={s === sort}
            aria-controls="hashtag-panel"
            tabIndex={s === sort ? 0 : -1}
            className={`profile-tab${s === sort ? ' is-active' : ''}`}
            onClick={() => select(s)}
            onKeyDown={(e) => handleKeyDown(e, i)}
          >
            {t(`hashtag.tabs.${s}`)}
          </button>
        ))}
      </div>

      <div id="hashtag-panel" role="tabpanel" aria-labelledby={`hashtag-tab-${sort}`}>
        {state === 'loading' && <FeedSkeleton />}
        {state === 'error' && <FeedErrorState message={error} onRetry={reload} />}
        {state === 'empty' && <p className="hashtag-feed-empty">{t('hashtag.empty', { tag })}</p>}
        {state === 'list' && <FeedList posts={posts} hasMore={hasMore} isLoadingMore={loadingMore} onLoadMore={loadMore} />}
      </div>
    </div>
  );
}

export default HashtagFeedScreen;
