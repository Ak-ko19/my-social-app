import { useState } from 'react';
import api, { resolveImageUrl } from './api';
import { useNavigate } from 'react-router-dom';

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
            <div key={u.id} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px' }}>
              <img
                src={resolveImageUrl(u.avatar_url)}
                alt=""
                hidden={!u.avatar_url}
                style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '50%', verticalAlign: 'middle', marginRight: '8px' }}
              />
              <strong>{u.username}</strong>
              {u.bio && <p style={{ margin: '5px 0', color: '#555' }}>{u.bio}</p>}
              {token && (
                <button onClick={() => navigate(`/messages/${u.id}`)}>Message</button>
              )}
            </div>
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
