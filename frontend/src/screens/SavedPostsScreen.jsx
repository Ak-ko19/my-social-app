import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../components/ui';
import { useTranslation } from 'react-i18next';
import FeedList from '../components/feed/FeedList';
import FeedSkeleton from '../components/feed/FeedSkeleton';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useAuth } from '../hooks/useAuth';
import { useSavedPosts } from '../hooks/useSavedPosts';
import CollectionsRow from '../components/saved/CollectionsRow';
import '../components/feed/Feed.css';
import './SavedPostsScreen.css';

function SavedPostsScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const { posts, loading, loadingMore, error, hasMore, reload, loadMore, removePost, updatePostContent } = useSavedPosts(token);

  const state = loading ? 'loading' : error ? 'error' : posts.length === 0 ? 'empty' : 'list';

  return (
    <div className="screen-enter">
      <header className="saved-posts-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.back')} onClick={() => navigate(-1)} />
        <h1 className="saved-posts-header-title">{t('saved.title')}</h1>
      </header>

      {/* Day 46: collections first, then every saved post. */}
      <CollectionsRow token={token} />
      <h2 className="saved-posts-section">{t('collections.allSaved')}</h2>

      {state === 'loading' && <FeedSkeleton />}
      {state === 'error' && <FeedErrorState message={error} onRetry={reload} />}
      {state === 'empty' && <p className="saved-posts-empty">{t('saved.empty')}</p>}
      {state === 'list' && (
        <FeedList
          posts={posts}
          hasMore={hasMore}
          isLoadingMore={loadingMore}
          onLoadMore={loadMore}
          onRemovePost={removePost}
          onUpdatePost={updatePostContent}
        />
      )}
    </div>
  );
}

export default SavedPostsScreen;
