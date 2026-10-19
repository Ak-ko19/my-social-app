import { useEffect, useState } from 'react';
import Avatar from '../common/Avatar';
import { useTranslation } from 'react-i18next';
import { fetchFollowingPage } from '../../services/messageService';

const PAGE_SIZE = 100;
const SEARCH_DELAY_MS = 250;

// B10: pick people (from the accounts you follow) for a group. Native
// checkboxes so it's keyboard/screen-reader friendly for free; a filter box
// once the list is long. `excludeIds` hides people already in the group.
// Day 69: the list comes a page at a time and the filter searches on the
// server, so following thousands of accounts never loads them all at once.
// People picked stay picked when a search hides them.
function MemberPicker({ userId, token, selectedIds, onChange, excludeIds = [] }) {
  const { t } = useTranslation();
  // { people, page, hasMore, q } for the search on screen; people null = loading.
  const [list, setList] = useState({ people: null, page: 0, hasMore: false, q: '' });
  const [followsAnyone, setFollowsAnyone] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  // The first page for what's typed (right away when it's empty).
  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    const timer = setTimeout(() => {
      fetchFollowingPage(userId, token, { q, limit: PAGE_SIZE })
        .then((data) => {
          if (cancelled) return;
          setList({ people: data.users, page: 1, hasMore: data.hasMore, q });
          if (!q) setFollowsAnyone(data.users.length > 0);
          setError('');
        })
        .catch((err) => {
          console.error(err);
          if (cancelled) return;
          setError(t('members.loadFailed'));
          setList((current) => ({ ...current, people: current.people || [] }));
        });
    }, q ? SEARCH_DELAY_MS : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userId, token, query, t]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await fetchFollowingPage(userId, token, { q: list.q, page: list.page + 1, limit: PAGE_SIZE });
      setList((current) => (current.q === list.q
        ? { ...current, people: [...current.people, ...data.users], page: current.page + 1, hasMore: data.hasMore }
        : current));
    } catch (err) {
      console.error(err);
      setError(t('members.loadFailed'));
    } finally {
      setLoadingMore(false);
    }
  };

  const toggle = (id) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  if (list.people === null) return <p className="screen-status" role="status">{t('members.loading')}</p>;
  if (error && followsAnyone === null) return <p className="form-error" role="alert">{error}</p>;
  if (followsAnyone === false) {
    return <p className="screen-status">{t('members.followFirst')}</p>;
  }
  const visible = list.people;

  return (
    <div className="member-picker">
      <label className="feed-visually-hidden" htmlFor="member-picker-filter">
        {t('members.filter')}
      </label>
      <input
        id="member-picker-filter"
        type="search"
        className="form-input"
        placeholder={t('members.searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="member-picker-list">
        {visible.map((p) => {
          const already = excludeIds.includes(p.id);
          return (
            <li key={p.id}>
              <label className={already ? 'member-picker-row is-disabled' : 'member-picker-row'}>
                <input
                  type="checkbox"
                  checked={already || selectedIds.includes(p.id)}
                  disabled={already}
                  onChange={() => toggle(p.id)}
                />
                <Avatar src={p.avatar_url} size={36} alt="" />
                <span className="member-picker-name">{p.username}</span>
                {already && <span className="member-picker-note">{t('members.inGroup')}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      {visible.length === 0 && list.q && <p className="screen-status" role="status">{t('members.noMatches')}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {list.hasMore && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? t('members.loading') : t('common.loadMore')}
        </button>
      )}
    </div>
  );
}

export default MemberPicker;
