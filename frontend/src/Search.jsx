import { useRef, useState } from 'react';
import { resolveImageUrl } from './api';
import { getOptimizedImageUrl } from './utils/cloudinaryImage';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Hash } from 'lucide-react';
import { IconButton, Avatar } from './components/ui';
import { createConversation } from './services/messageService';
import { useTrendingHashtags } from './hooks/useExplore';
import { useSearch } from './hooks/useSearch';
import TrendingHashtags from './components/explore/TrendingHashtags';
import PeopleYouMayKnow from './components/explore/PeopleYouMayKnow';
import RecentSearches from './components/search/RecentSearches';
import { saveSearch } from './services/searchService';
import { Compass } from 'lucide-react';
import { useFollowToggle } from './hooks/useFollowToggle';
import FollowButton from './components/feed/FollowButton';
import { useTranslation } from 'react-i18next';
import { serverErrorText } from './utils/serverError';
import { arrowStep } from './utils/direction';
import { formatDate } from './i18n';
import './components/profile/ProfileTabs.css';

// Day 42: the query and the tab live in the URL (/search?q=tea&type=posts),
// so Back, reload and shared links keep them.
const TYPES = ['all', 'people', 'posts', 'hashtags'];
// How many people / hashtags the All tab shows before "See all".
const ALL_TAB_PREVIEW = 3;

// /search/users says whether the viewer already follows each person (Day
// 42), so the button starts right.
function SearchUserResult({ user, token, onMessage }) {
  const { t } = useTranslation();
  const follow = useFollowToggle(user.id, user.is_following, token);

  return (
    <li className="card-row">
      <Avatar size={40} src={resolveImageUrl(user.avatar_url)} initials={(user.username || '?').slice(0, 2).toUpperCase()} alt="" />
      <div className="card-row-body">
        <Link to={`/profile/${user.id}`} className="screen-link">{user.username}</Link>
        {user.bio && <p className="card-row-quote" dir="auto">{user.bio}</p>}
        {token && (
          <div className="card-row-actions">
            <FollowButton follow={follow} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onMessage(user.id)}>{t('common.message')}</button>
          </div>
        )}
      </div>
    </li>
  );
}

function HashtagResult({ tag }) {
  const { t } = useTranslation();
  return (
    <li className="card-row">
      <span className="search-tag-icon" aria-hidden="true"><Hash size={18} /></span>
      <div className="card-row-body">
        <Link to={`/hashtag/${encodeURIComponent(tag.tag)}`} className="screen-link"><bdi>#{tag.tag}</bdi></Link>
        <span className="card-row-meta">
          {tag.capped ? t('search.manyPosts', { n: tag.post_count }) : t('explore.postCount', { count: tag.post_count })}
        </span>
      </div>
    </li>
  );
}

function PostResult({ post }) {
  const { t } = useTranslation();
  return (
    <li className="card-row">
      <div className="card-row-body">
        {post.page ? (
          <Link to={`/pages/${post.page.id}`} className="screen-link">{post.page.name}</Link>
        ) : (
          <Link to={`/profile/${post.user_id}`} className="screen-link">{post.username}</Link>
        )}
        <p className="search-post-content">
          <Link to={`/posts/${post.id}`} className="search-post-link" dir="auto">{post.content}</Link>
        </p>
        {post.image_url && <img className="image-preview" src={getOptimizedImageUrl(resolveImageUrl(post.image_url), 960)} alt={t('search.attachment')} loading="lazy" decoding="async" />}
        <span className="card-row-meta">{formatDate(post.created_at)}</span>
      </div>
    </li>
  );
}

function Search() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') || '').trim();
  const type = TYPES.includes(params.get('type')) ? params.get('type') : 'all';
  const [input, setInput] = useState(q);
  // Back/forward changes the URL's query: show it in the box too.
  const [shownQ, setShownQ] = useState(q);
  if (q !== shownQ) {
    setShownQ(q);
    setInput(q);
  }
  const [error, setError] = useState('');
  const tabRefs = useRef({});
  const navigate = useNavigate();
  const { t } = useTranslation();

  const token = localStorage.getItem('token');
  // B7: shown before the first search, as a starting point.
  const trending = useTrendingHashtags(token);
  const search = useSearch(q, token);

  // /messages/:conversationId takes a CONVERSATION id -- this used to
  // navigate to /messages/<userId>, opening the wrong chat (or none).
  // POST /conversations returns the existing direct conversation if there
  // already is one, so this is safe to call every time.
  const openConversation = (userId) => {
    createConversation(userId, token)
      .then((conversation) => navigate(`/messages/${conversation.id}`))
      .catch((err) => {
        console.error(err);
        setError(serverErrorText(err, 'search.openFailed'));
      });
  };

  // A search the person runs (typed, or a recent one tapped) -- not one
  // opened from a link -- goes into their recent searches.
  const runSearch = (next) => {
    // A new query is a new history entry, so Back returns to the last one.
    setParams(type === 'all' ? { q: next } : { q: next, type });
    if (token) saveSearch(next, token).catch((err) => console.error(err));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setError('');
    const next = input.trim();
    if (!next) {
      setError(t('search.enterTerm'));
      return;
    }
    runSearch(next);
  };

  const selectType = (next) => {
    setParams(next === 'all' ? { q } : { q, type: next }, { replace: true });
    tabRefs.current[next]?.focus();
  };
  const handleTabKeyDown = (e, index) => {
    const step = arrowStep(e.key);
    let next = null;
    if (step) next = (index + step + TYPES.length) % TYPES.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TYPES.length - 1;
    if (next !== null) {
      e.preventDefault();
      selectType(TYPES[next]);
    }
  };

  const { users, hashtags, posts } = search;
  const seeAll = (next) => (
    <button type="button" className="btn btn-secondary btn-sm search-see-all" onClick={() => selectType(next)}>
      {t('search.seeAll')}
    </button>
  );
  const peopleList = (list) => (
    <ul className="card-list">
      {list.map((u) => <SearchUserResult key={u.id} user={u} token={token} onMessage={openConversation} />)}
    </ul>
  );
  const hashtagList = (list) => (
    <ul className="card-list">{list.map((tag) => <HashtagResult key={tag.tag} tag={tag} />)}</ul>
  );
  const postList = (
    <>
      <ul className="card-list">{posts.map((p) => <PostResult key={p.id} post={p} />)}</ul>
      {search.hasMore && (
        <div className="explore-more">
          <button type="button" className="feed-btn" onClick={search.loadMorePosts} disabled={search.loadingMore}>
            {search.loadingMore ? t('common.loading') : t('common.loadMore')}
          </button>
        </div>
      )}
    </>
  );

  let panel;
  if (search.status === 'loading') {
    panel = <p className="screen-status" role="status">{t('search.searching')}</p>;
  } else if (search.status === 'error') {
    panel = (
      <div className="screen-status">
        <p className="form-error" role="alert">{t('search.failed')}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={search.retry}>{t('common.retry')}</button>
      </div>
    );
  } else if (type === 'people') {
    panel = users.length ? peopleList(users) : <p className="screen-status">{t('search.noUsers')}</p>;
  } else if (type === 'hashtags') {
    panel = hashtags.length ? hashtagList(hashtags) : <p className="screen-status">{t('search.noHashtags')}</p>;
  } else if (type === 'posts') {
    panel = posts.length ? postList : <p className="screen-status">{t('search.noPosts')}</p>;
  } else if (!users.length && !hashtags.length && !posts.length) {
    panel = <p className="screen-status">{t('search.noResults', { query: q })}</p>;
  } else {
    panel = (
      <>
        {users.length > 0 && (
          <section aria-labelledby="search-all-people">
            <h2 id="search-all-people" className="section-heading">{t('search.tabs.people')}</h2>
            {peopleList(users.slice(0, ALL_TAB_PREVIEW))}
            {users.length > ALL_TAB_PREVIEW && seeAll('people')}
          </section>
        )}
        {hashtags.length > 0 && (
          <section aria-labelledby="search-all-hashtags">
            <h2 id="search-all-hashtags" className="section-heading">{t('search.tabs.hashtags')}</h2>
            {hashtagList(hashtags.slice(0, ALL_TAB_PREVIEW))}
            {hashtags.length > ALL_TAB_PREVIEW && seeAll('hashtags')}
          </section>
        )}
        {posts.length > 0 && (
          <section aria-labelledby="search-all-posts">
            <h2 id="search-all-posts" className="section-heading">{t('search.tabs.posts')}</h2>
            {postList}
          </section>
        )}
      </>
    );
  }

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToHome')} onClick={() => navigate('/')} />
        <h1 className="screen-header-title">{t('search.title')}</h1>
      </header>

      <div className="screen-body">
        <form className="inline-form" onSubmit={handleSearch} role="search">
          <input
            type="search"
            className="form-input"
            aria-label={t('search.label')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('search.placeholder')}
          />
          {/* Never disabled: a slow search must not stop a new one (a newer
              query's results always win, see useSearch). */}
          <button type="submit" className="btn btn-primary">{t('common.search')}</button>
        </form>
        {error && <p className="form-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>{error}</p>}

        {search.status === 'idle' && (
          <>
            <RecentSearches token={token} onPick={(query) => { setInput(query); runSearch(query); }} />
            <PeopleYouMayKnow token={token} />
            <TrendingHashtags tags={trending.tags} loaded={trending.loaded} />
            <Link to="/explore" className="screen-link explore-link">
              <Compass size={16} aria-hidden="true" /> {t('search.explore')}
            </Link>
          </>
        )}
      </div>

      {search.status !== 'idle' && (
        <>
          <div role="tablist" aria-label={t('search.filters')} className="profile-tablist">
            {TYPES.map((tp, i) => (
              <button
                key={tp}
                ref={(el) => { tabRefs.current[tp] = el; }}
                type="button"
                role="tab"
                id={`search-tab-${tp}`}
                aria-selected={tp === type}
                aria-controls="search-panel"
                tabIndex={tp === type ? 0 : -1}
                className={`profile-tab${tp === type ? ' is-active' : ''}`}
                onClick={() => selectType(tp)}
                onKeyDown={(e) => handleTabKeyDown(e, i)}
              >
                {t(`search.tabs.${tp}`)}
              </button>
            ))}
          </div>
          <div id="search-panel" role="tabpanel" aria-labelledby={`search-tab-${type}`} className="screen-body search-panel">
            {panel}
          </div>
        </>
      )}
    </div>
  );
}

export default Search;
