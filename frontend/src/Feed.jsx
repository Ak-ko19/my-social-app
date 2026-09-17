import { useState, useEffect } from 'react';
import api, { resolveImageUrl } from './api';
import { useNavigate } from 'react-router-dom';

function Feed() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [commentInputs, setCommentInputs] = useState({});
  const [commentsVisible, setCommentsVisible] = useState({});
  const [comments, setComments] = useState({});
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editCommentText, setEditCommentText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();

  const token = localStorage.getItem('token');
  const currentUserId = parseInt(localStorage.getItem('userId'));

  const loadFeed = () => {
    api.get('/feed', {
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

  const loadUnreadCount = () => {
    api.get('/notifications/unread-count', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then((response) => setUnreadCount(response.data.unreadCount))
    .catch((err) => console.error(err));
  };

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    loadFeed();
    loadUnreadCount();
  }, []);

  const handleLike = (postId) => {
    api.post(`/posts/${postId}/like`, {}, {
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
    api.delete(`/posts/${postId}/like`, {
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
    api.post(`/users/${userId}/follow`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(() => alert('Followed!'))
    .catch((err) => console.error(err));
  };

  const handleUnfollow = (userId) => {
    api.delete(`/users/${userId}/follow`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(() => alert('Unfollowed!'))
    .catch((err) => console.error(err));
  };

  const toggleComments = (postId) => {
    const isVisible = commentsVisible[postId];
    setCommentsVisible({ ...commentsVisible, [postId]: !isVisible });

    if (!isVisible) {
      api.get(`/posts/${postId}/comments`)
      .then((response) => {
        setComments({ ...comments, [postId]: response.data });
      })
      .catch((err) => console.error(err));
    }
  };

  const handleCommentSubmit = (postId) => {
    const content = commentInputs[postId];
    if (!content) return;

    api.post(`/posts/${postId}/comments`,
      { content: content },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    .then(() => {
      setCommentInputs({ ...commentInputs, [postId]: '' });
      api.get(`/posts/${postId}/comments`)
      .then((response) => {
        setComments({ ...comments, [postId]: response.data });
      });
    })
    .catch((err) => console.error(err));
  };

  const startEditComment = (comment) => {
    setEditingCommentId(comment.id);
    setEditCommentText(comment.content);
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditCommentText('');
  };

  const handleCommentEditSave = (postId, commentId) => {
    if (!editCommentText.trim()) return;

    api.put(`/comments/${commentId}`,
      { content: editCommentText },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    .then(() => {
      setEditingCommentId(null);
      setEditCommentText('');
      api.get(`/posts/${postId}/comments`)
      .then((response) => {
        setComments({ ...comments, [postId]: response.data });
      });
    })
    .catch((err) => {
      alert(err.response?.data || 'Failed to update comment');
      console.error(err);
    });
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
        {' | '}
        <a href="/notifications">Notifications{unreadCount > 0 ? ` (${unreadCount})` : ''}</a>
        {' | '}
        <a href="/messages">Messages</a>
        {' | '}
        <a href="/search">Search</a>
      </p>

      {posts.length === 0 && <p>No posts yet. Follow someone to see their posts here!</p>}

      {posts.map((post) => (
        <div key={post.id} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '15px' }}>
          <img
            src={resolveImageUrl(post.avatar_url)}
            alt=""
            hidden={!post.avatar_url}
            style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '50%', verticalAlign: 'middle', marginRight: '8px' }}
          />
          <strong>{post.username}</strong>
          <button onClick={() => handleFollow(post.user_id)} style={{ marginLeft: '10px' }}>Follow</button>
          <button onClick={() => handleUnfollow(post.user_id)} style={{ marginLeft: '5px' }}>Unfollow</button>
          {post.user_id !== currentUserId && (
            <button onClick={() => navigate(`/messages/${post.user_id}`)} style={{ marginLeft: '5px' }}>Message</button>
          )}

          <p>{post.content}</p>
          {post.image_url && (
            <img
              src={resolveImageUrl(post.image_url)}
              alt="Post attachment"
              style={{ maxWidth: '100%', maxHeight: '300px', display: 'block', marginBottom: '10px' }}
            />
          )}
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
                  {editingCommentId === c.id ? (
                    <>
                      <input
                        type="text"
                        value={editCommentText}
                        onChange={(e) => setEditCommentText(e.target.value)}
                      />
                      <button onClick={() => handleCommentEditSave(post.id, c.id)} style={{ marginLeft: '5px' }}>Save</button>
                      <button onClick={cancelEditComment} style={{ marginLeft: '5px' }}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <strong>{c.username}: </strong>{c.content}
                      {c.user_id === currentUserId && (
                        <button onClick={() => startEditComment(c)} style={{ marginLeft: '5px' }}>Edit</button>
                      )}
                    </>
                  )}
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