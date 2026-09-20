import { useState } from 'react';
import api, { resolveImageUrl } from './api';
import { useNavigate } from 'react-router-dom';
import { useFollowToggle } from './hooks/useFollowToggle';
import FollowButton from './components/feed/FollowButton';

// Search's own /search/users results don't include is_following (unlike
// /feed's posts, which are already scoped to followed users by
// construction) -- seeding false here is a one-click-off worst case, not a
// bug: if the searcher already follows this user, useFollowToggle's own
// "already following" conflict handling (see its own comment) keeps the
// optimistic true state instead of rolling back, so a stray click just
// self-corrects instead of actually breaking anything.
function SearchUserResult({ user, token, onMessage }) {
  const follow = useFollowToggle(user.id, false, token);

  return (
    <div style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px' }}>
      <img
        src={resolveImageUrl(user.avatar_url)}
        alt=""
        hidden={!user.avatar_url}
        style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '50%', verticalAlign: 'middle', marginRight: '8px' }}
      />
      <strong>{user.username}</strong>
      {user.bio && <p style={{ margin: '5px 0', color: '#555' }}>{user.bio}</p>}
      {token && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <FollowButton follow={follow} />
          <button onClick={() => onMessage(user.id)}>Message</button>
        </div>
      )}
    </div>
  );
}

function Search() {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const token = localStorage.getItem('token');

  const handleSearch = (e) => {
    e.preventDefault();
    setError('');

    if (!query.trim()) {
      setError('Enter a search term');
      return;
    }

    Promise.all([
      api.get('/search/users', { params: { q: query.trim() } }),
      api.get('/search/posts', { params: { q: query.trim() } })
    ])
    .then(([usersRes, postsRes]) => {
      setUsers(usersRes.data);
      setPosts(postsRes.data.posts);
      setSearched(true);
    })
    .catch((err) => {
      console.error(err);
      setError('Search failed. Please try again.');
    });
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Search</h2>
      <p><a href="/feed">Back to Feed</a></p>

      <form onSubmit={handleSearch}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search users or posts..."
          style={{ width: '70%' }}
        />
        <button type="submit" style={{ marginLeft: '5px' }}>Search</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {searched && (
        <div style={{ marginTop: '20px' }}>
          <h3>Users</h3>
          {users.length === 0 && <p>No matching users.</p>}
          {users.map((u) => (
            <SearchUserResult key={u.id} user={u} token={token} onMessage={(id) => navigate(`/messages/${id}`)} />
          ))}

          <h3>Posts</h3>
          {posts.length === 0 && <p>No matching posts.</p>}
          {posts.map((p) => (
            <div key={p.id} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px' }}>
              <strong>{p.username}</strong>
              <p>{p.content}</p>
              {p.image_url && (
                <img
                  src={resolveImageUrl(p.image_url)}
                  alt="Post attachment"
                  style={{ maxWidth: '100%', maxHeight: '200px', display: 'block' }}
                />
              )}
              <small>{new Date(p.created_at).toLocaleString()}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Search;
