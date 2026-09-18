import PostCard from './PostCard';

function FeedList({ posts }) {
  return (
    <ul className="feed-list">
      {posts.map((post) => (
        <li key={post.id} className="feed-list-item">
          <PostCard post={post} />
        </li>
      ))}
    </ul>
  );
}

export default FeedList;
