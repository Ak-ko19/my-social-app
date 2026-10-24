import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../components/ui';
import PostCard from '../components/feed/PostCard';
import FeedSkeleton from '../components/feed/FeedSkeleton';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useAuth } from '../hooks/useAuth';
import { useMemories } from '../hooks/useMemories';
import { formatDate } from '../i18n';
import '../components/feed/Feed.css';
import './MemoriesScreen.css';

// Days 83-84: Memories, like Facebook's "On this day" -- your posts from
// today's date in earlier years, one section per year. Only you see it.
function MemoriesScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const { data, loading, error, reload, removePost, updatePost } = useMemories(token);

  return (
    <div className="screen-enter">
      <header className="memories-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.back')} onClick={() => navigate(-1)} />
        <h1 className="memories-header-title">{t('memories.title')}</h1>
      </header>
      {data && (
        <p className="memories-intro">
          {t('memories.intro', { date: formatDate(`${data.date}T12:00:00Z`, 'dayMonth') })}
        </p>
      )}

      {loading && <FeedSkeleton />}
      {error && <FeedErrorState message={t('memories.loadFailed')} onRetry={reload} />}
      {data && data.memories.length === 0 && (
        <p className="memories-empty" role="status">{t('memories.empty')}</p>
      )}
      {data && data.memories.map((m) => (
        <section key={m.yearsAgo} className="memories-year" aria-labelledby={`memories-year-${m.yearsAgo}`}>
          <h2 id={`memories-year-${m.yearsAgo}`} className="memories-year-title">
            {t('memories.yearsAgo', { count: m.yearsAgo })}{' · '}
            <span className="memories-year-number">{m.year}</span>
          </h2>
          <ul className="memories-posts">
            {m.posts.map((post) => (
              <li key={post.id}>
                <PostCard post={post} onRemovePost={removePost} onUpdatePost={updatePost} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default MemoriesScreen;
