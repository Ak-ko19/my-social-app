import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import FeedErrorState from '../feed/FeedErrorState';
import { searchAsAdmin } from '../../services/adminService';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { serverErrorText } from '../../utils/serverError';
import './AdminSearchPanel.css';

const TYPES = ['posts', 'comments', 'users'];
const MIN_QUERY = 2;
const AUDIENCE = { public: 'compose.public', followers: 'compose.followers', close_friends: 'compose.closeFriends', only_me: 'compose.onlyMe' };

// Days 103-104: Admin > Search -- posts and comments by their text,
// accounts by username or exact email, whoever may see them. Searching
// runs when the admin submits (each search is written to the admin log,
// so not on every keystroke).
function AdminSearchPanel({ token }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('posts');
  const [searched, setSearched] = useState(null); // { q, type }
  const [data, setData] = useState(null); // { results, hasMore, page }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  const run = (q, kind, page = 1) => {
    const id = ++requestRef.current;
    setLoading(true);
    setError('');
    searchAsAdmin(token, { q, type: kind, page })
      .then((d) => {
        if (id !== requestRef.current) return;
        setData((current) => (page === 1 ? d : { ...d, results: [...current.results, ...d.results] }));
      })
      .catch((err) => {
        if (id !== requestRef.current) return;
        console.error(err);
        setError(serverErrorText(err, 'admin.search.failed'));
      })
      .finally(() => {
        if (id === requestRef.current) setLoading(false);
      });
  };

  const submit = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setError(t('admin.search.tooShort'));
      return;
    }
    setSearched({ q, type });
    setData(null);
    run(q, type);
  };

  // Switching the kind searches the same words again.
  const chooseType = (kind) => {
    if (kind === type) return;
    setType(kind);
    if (!searched) return;
    setSearched({ q: searched.q, type: kind });
    setData(null);
    run(searched.q, kind);
  };

  return (
    <div className="admin-search">
      <form className="admin-search-form" role="search" onSubmit={submit}>
        <label className="feed-visually-hidden" htmlFor="admin-search-input">{t('admin.search.label')}</label>
        <input
          id="admin-search-input"
          type="search"
          className="form-input"
          dir="auto"
          maxLength={100}
          value={query}
          placeholder={t('admin.search.placeholder')}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={loading}>
          <Search size={16} aria-hidden="true" />
          <span>{t('admin.search.submit')}</span>
        </button>
      </form>
      <div role="radiogroup" aria-label={t('admin.search.kindLabel')} className="admin-tabs admin-search-kinds">
        {TYPES.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={type === k} className={clsx('admin-tab', type === k && 'is-active')} onClick={() => chooseType(k)}>
            {t(`admin.search.kinds.${k}`)}
          </button>
        ))}
      </div>
      <p className="admin-search-note">{t('admin.search.note')}</p>

      {error && (searched ? <FeedErrorState message={error} onRetry={() => run(searched.q, searched.type)} /> : <p className="form-error" role="alert">{error}</p>)}
      {loading && !data && <p className="screen-status" role="status">{t('common.loading')}</p>}
      {data && data.results.length === 0 && <p className="screen-status" role="status">{t('admin.search.empty', { q: searched.q })}</p>}
      {data && data.results.length > 0 && (
        <ul className="admin-search-list" aria-label={t('admin.search.resultsLabel', { q: searched.q })}>
          {data.results.map((r) => (
            <li key={r.id} className="admin-search-item">
              {data.type === 'users' ? <AccountResult r={r} /> : <TextResult r={r} kind={data.type} />}
            </li>
          ))}
        </ul>
      )}
      {data && data.hasMore && (
        <button type="button" className="btn btn-secondary btn-block" disabled={loading} onClick={() => run(searched.q, searched.type, data.page + 1)}>
          {loading ? t('common.loading') : t('admin.search.loadMore')}
        </button>
      )}
    </div>
  );
}

// A post or a comment: its words, who wrote it, where, when.
function TextResult({ r, kind }) {
  const { t } = useTranslation();
  const postId = kind === 'posts' ? r.id : r.post_id;
  return (
    <>
      <p className="admin-search-text" dir="auto">“{r.content}”</p>
      <p className="admin-search-meta">
        <Link to={`/profile/${r.author_id}`}>{r.author_username}</Link>
        {r.author_banned && <span className="admin-search-flag">{t('admin.banned')}</span>}
        {r.community_name && <span>{t(r.community_privacy === 'private' ? 'admin.search.inPrivateGroup' : 'admin.search.inGroup', { name: r.community_name })}</span>}
        {r.page_name && <span>{t('admin.search.onPage', { name: r.page_name })}</span>}
        {kind === 'posts' && !r.community_name && !r.page_name && <span>{t(AUDIENCE[r.visibility])}</span>}
        <time dateTime={r.created_at}>{formatRelativeTime(r.created_at)}</time>
      </p>
      <Link className="admin-search-open" to={`/posts/${postId}`}>
        {kind === 'posts' ? t('admin.openPost') : t('admin.search.openCommentPost')}
      </Link>
    </>
  );
}

// An account: name, email, and what state it is in.
function AccountResult({ r }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="admin-search-name">
        <Link to={`/profile/${r.id}`}>{r.username}</Link>
      </p>
      <p className="admin-search-meta">
        <bdi>{r.email}</bdi>
        {r.banned && <span className="admin-search-flag">{r.banned_until ? t('admin.search.suspended') : t('admin.banned')}</span>}
        {r.is_deactivated && <span className="admin-search-flag">{t('admin.search.deactivated')}</span>}
        {r.is_private && <span>{t('admin.search.private')}</span>}
        {r.is_admin && <span>{t('admin.search.isAdmin')}</span>}
        <span>{t('admin.search.joined', { when: formatRelativeTime(r.created_at) })}</span>
      </p>
    </>
  );
}

export default AdminSearchPanel;
