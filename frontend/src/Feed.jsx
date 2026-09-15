import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function Feed() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [commentInputs, setCommentInputs] = useState({});
  const [commentsVisible, setCommentsVisible] = useState({});
  const [comments, setComments] = useState({});
  const navigate = useNavigate();

  const token = localStorage.getItem('token');

  const loadFeed = () => {
    axios.get('http://localhost:3000/feed', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then((response) => {
      setPosts(response.data.posts);
      setLoading(false);
    })
    .catch((err) => {
      console.error(err);
      setError('Failed to load feed');
      setLoading(false);
    });
  };

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    loadFeed();
  }, []);

  const handleLike = (postId) => {
    axios.post(`http://localhost:3000/posts/${postId}/like`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(() => {
      alert('Liked successfully!');
      loadFeed();
    })
    .catch((err) => {
      alert(err.response?.data || 'Already liked or error occurred');
      console.error(err);
    });
  };

  const handleUnlike = (postId) => {
    axios.delete(`http://localhost:3000/posts/${postId}/like`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(() => {
      alert('Unliked successfully!');
      loadFeed();
    })
    .catch((err) => {
      alert(err.response?.data || 'You have not liked this post');
      console.error(err);
    });
  };

  const handleFollow = (userId) => {
    axios.post(`http://localhost:3000/users/${userId}/follow`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(() => alert('Followed!'))
    .catch((err) => console.error(err));
  };

  const handleUnfollow = (userId) => {
    axios.delete(`http://localhost:3000/users/${userId}/follow`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(() => alert('Unfollowed!'))
    .catch((err) => console.error(err));
  };

  const toggleComments = (postId) => {
    const isVisible = commentsVisible[postId];
    setCommentsVisible({ ...commentsVisible, [postId]: !isVisible });

    if (!isVisible) {
      axios.get(`http://localhost:3000/posts/${postId}/comments`)
      .then((response) => {
        setComments({ ...comments, [postId]: response.data });
      })
      .catch((err) => console.error(err));
    }
  };

  const handleCommentSubmit = (postId) => {
    const content = commentInputs[postId];
    if (!content) return;

    axios.post(`http://localhost:3000/posts/${postId}/comments`,
      { content: content },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    .then(() => {
      setCommentInputs({ ...commentInputs, [postId]: '' });
      axios.get(`http://localhost:3000/posts/${postId}/comments`)
      .then((response) => {
        setComments({ ...comments, [postId]: response.data });
      });
    })
    .catch((err) => console.error(err));
  };

  if (loading) return <p>Loading feed...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div style={{ padding: '20px' }}>
      <h2>My Feed</h2>
      <p>
        <a href="/create-post">+ Create New Post</a>
        {' | '}
        <a href="/edit-profile">Edit Profile</a>
      </p>

      {posts.length === 0 && <p>No posts yet. Follow someone to see their posts here!</p>}

      {posts.map((post) => (
        <div key={post.id} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '15px' }}>
          <strong>{post.username}</strong>
          <button onClick={() => handleFollow(post.user_id)} style={{ marginLeft: '10px' }}>Follow</button>
          <button onClick={() => handleUnfollow(post.user_id)} style={{ marginLeft: '5px' }}>Unfollow</button>

          <p>{post.content}</p>
          <small>{new Date(post.created_at).toLocaleString()}</small>

          <div style={{ marginTop: '10px' }}>
            <button onClick={() => handleLike(post.id)}>Like</button>
            <button onClick={() => handleUnlike(post.id)} style={{ marginLeft: '5px' }}>Unlike</button>
            <button onClick={() => toggleComments(post.id)} style={{ marginLeft: '5px' }}>
              {commentsVisible[post.id] ? 'Hide Comments' : 'Show Comments'}
            </button>
          </div>

          {commentsVisible[post.id] && (
            <div style={{ marginTop: '10px', paddingLeft: '10px', borderLeft: '2px solid #eee' }}>
              {comments[post.id] && comments[post.id].map((c) => (
                <div key={c.id} style={{ marginBottom: '5px' }}>
                  <strong>{c.username}: </strong>{c.content}
                </div>
              ))}
              <input
                type="text"
                value={commentInputs[post.id] || ''}
                onChange={(e) => setCommentInputs({ ...commentInputs, [post.id]: e.target.value })}
                placeholder="Write a comment..."
              />
              <button onClick={() => handleCommentSubmit(post.id)} style={{ marginLeft: '5px' }}>Send</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default Feed;