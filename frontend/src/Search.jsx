import { useRef, useState } from 'react';
import api, { resolveImageUrl } from './api';
import { getOptimizedImageUrl } from './utils/cloudinaryImage';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton, Avatar } from './components/ui';
import { createConversation } from './services/messageService';
import { useTrendingHashtags } from './hooks/useExplore';
import TrendingHashtags from './components/explore/TrendingHashtags';
import PeopleYouMayKnow from './components/explore/PeopleYouMayKnow';
import { Compass } from 'lucide-react';
import { useFollowToggle } from './hooks/useFollowToggle';
import FollowButton from './components/feed/FollowButton';
import { useTranslation } from 'react-i18next';
import { serverErrorText } from './utils/serverError';
import { formatDate } from './i18n';

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

function Search() {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  // Guards against an older, slower search overwriting a newer one's results.
  const requestIdRef = useRef(0);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const token = localStorage.getItem('token');
  // B7: shown before the first search, as a starting point.
  const trending = useTrendingHashtags(token);

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

  const handleSearch = (e) => {
    e.preventDefault();
    setError('');

    if (!query.trim()) {
      setError(t('search.enterTerm'));
      return;
    }

    const requestId = ++requestIdRef.current;
    setSearching(true);

    // Search is optionalAuth on the backend -- without the token it runs as
    // an anonymous visitor, so blocked users still appear and followed
    // private accounts' posts are hidden.
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    Promise.all([
      api.get('/search/users', { params: { q: query.trim() }, headers }),
      api.get('/search/posts', { params: { q: query.trim() }, headers })
    ])
    .then(([usersRes, postsRes]) => {
      if (requestId !== requestIdRef.current) return;
      setUsers(usersRes.data);
      setPosts(postsRes.data.posts);
      setSearched(true);
    })
    .catch((err) => {
      if (requestId !== requestIdRef.current) return;
      console.error(err);
      setSearched(false); // don't leave a previous query's results under this error
      setError(t('search.failed'));
    })
    .finally(() => {
      if (requestId === requestIdRef.current) setSearching(false);
    });
  };

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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
          />
          <button type="submit" className="btn btn-primary" disabled={searching}>
            {searching ? t('search.searching') : t('common.search')}
          </button>
        </form>
        {error && <p className="form-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>{error}</p>}
        {searching && <p className="screen-status" role="status">{t('search.searching')}</p>}

        {!searched && !searching && (
          <>
            <PeopleYouMayKnow token={token} />
            <TrendingHashtags tags={trending.tags} loaded={trending.loaded} />
            <Link to="/explore" className="screen-link explore-link">
              <Compass size={16} aria-hidden="true" /> {t('search.explore')}
            </Link>
          </>
        )}

        {searched && !searching && (
          <>
            <h2 className="section-heading">{t('search.users')}</h2>
            {users.length === 0 && <p className="screen-status">{t('search.noUsers')}</p>}
            <ul className="card-list">
              {users.map((u) => (
                <SearchUserResult key={u.id} user={u} token={token} onMessage={openConversation} />
              ))}
            </ul>

            <h2 className="section-heading">{t('search.posts')}</h2>
            {posts.length === 0 && <p className="screen-status">{t('search.noPosts')}</p>}
            <ul className="card-list">
              {posts.map((p) => (
                <li key={p.id} className="card-row">
                  <div className="card-row-body">
                    {p.page ? (
                      <Link to={`/pages/${p.page.id}`} className="screen-link">{p.page.name}</Link>
                    ) : (
                      <Link to={`/profile/${p.user_id}`} className="screen-link">{p.username}</Link>
                    )}
                    <p className="search-post-content">
                      <Link to={`/posts/${p.id}`} className="search-post-link" dir="auto">{p.content}</Link>
                    </p>
                    {p.image_url && <img className="image-preview" src={getOptimizedImageUrl(resolveImageUrl(p.image_url), 960)} alt={t('search.attachment')} loading="lazy" decoding="async" />}
                    <span className="card-row-meta">{formatDate(p.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export default Search;
