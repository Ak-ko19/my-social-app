import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton, ConfirmDialog } from '../components/ui';
import Avatar from '../components/common/Avatar';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import MemberPicker from '../components/messages/MemberPicker';
import FeedErrorState from '../components/feed/FeedErrorState';
import {
  fetchConversationDetails,
  addGroupMembers,
  removeGroupMember,
  renameGroup
} from '../services/messageService';
import '../components/feed/Feed.css';
import '../components/messages/Messages.css';

// B10: /messages/:conversationId/info -- members + roles for everyone;
// rename / add / remove for admins; leave for everyone.
function GroupInfoScreen() {
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const { token, userId } = useAuth();
  const { socket } = useSocket();
  const [group, setGroup] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState([]);
  const [confirm, setConfirm] = useState(null); // { kind: 'leave' } | { kind: 'remove', member }

  const load = useCallback(() => {
    fetchConversationDetails(conversationId, token)
      .then((data) => {
        setGroup(data);
        setLoadError('');
      })
      .catch((err) => {
        // 403 is an expected state (you left or were removed), not an error.
        if (err.response?.status === 403) {
          setLoadError("You're not in this group any more.");
          return;
        }
        console.error(err);
        setLoadError('Could not load the group.');
      });
  }, [conversationId, token]);

  useEffect(() => {
    load();
  }, [load]);

  // Someone else changed the group (added/removed/renamed) -- refresh.
  useEffect(() => {
    if (!socket) return undefined;
    const onUpdated = ({ conversationId: cid }) => {
      if (String(cid) === String(conversationId)) load();
    };
    socket.on('group_updated', onUpdated);
    return () => socket.off('group_updated', onUpdated);
  }, [socket, conversationId, load]);

  if (loadError) {
    return (
      <div className="screen-enter">
        <header className="screen-header">
          <IconButton icon={ChevronLeft} aria-label="Back to Messages" onClick={() => navigate('/messages')} />
          <h1 className="screen-header-title">Group info</h1>
        </header>
        <FeedErrorState message={loadError} onRetry={load} />
      </div>
    );
  }
  if (!group) return <p className="screen-status" role="status">Loading…</p>;

  const isAdmin = group.my_role === 'admin';
  const run = (promise) => {
    setActionError('');
    return promise.catch((err) => {
      console.error(err);
      setActionError(err.response?.data || 'Something went wrong. Please try again.');
      throw err;
    });
  };

  const saveName = (e) => {
    e.preventDefault();
    if (!nameDraft.trim()) return;
    run(renameGroup(conversationId, nameDraft.trim(), token))
      .then(({ name }) => {
        setGroup((g) => ({ ...g, name }));
        setRenaming(false);
      })
      .catch(() => {});
  };

  const addPeople = () => {
    if (toAdd.length === 0) return;
    run(addGroupMembers(conversationId, toAdd, token))
      .then(({ members }) => {
        setGroup((g) => ({ ...g, members }));
        setToAdd([]);
        setAdding(false);
      })
      .catch(() => {});
  };

  const confirmAction = async () => {
    if (confirm.kind === 'leave') {
      await run(removeGroupMember(conversationId, userId, token));
      navigate('/messages', { replace: true });
    } else {
      const { members } = await run(removeGroupMember(conversationId, confirm.member.id, token));
      setGroup((g) => ({ ...g, members }));
      setConfirm(null);
    }
  };

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label="Back to the chat" onClick={() => navigate(`/messages/${conversationId}`)} />
        <h1 className="screen-header-title">Group info</h1>
      </header>

      <div className="screen-body">
        {renaming ? (
          <form className="inline-form" onSubmit={saveName}>
            <label className="feed-visually-hidden" htmlFor="group-name-input">Group name</label>
            <input id="group-name-input" className="form-input" maxLength={100} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} autoFocus />
            <button type="submit" className="btn btn-primary" disabled={!nameDraft.trim()}>Save</button>
            <button type="button" className="btn btn-secondary" onClick={() => setRenaming(false)}>Cancel</button>
          </form>
        ) : (
          <div className="group-info-title">
            <h2 className="group-info-name">{group.name}</h2>
            {isAdmin && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setNameDraft(group.name); setRenaming(true); }}>
                Rename
              </button>
            )}
          </div>
        )}

        {actionError && <p className="form-error" role="alert">{actionError}</p>}

        <h3 className="section-heading">{group.members.length} members</h3>
        <ul className="card-list">
          {group.members.map((m) => (
            <li key={m.id} className="card-row group-member-row">
              <Avatar src={m.avatar_url} size={36} alt="" />
              <span className="card-row-body">
                {m.id === userId ? 'You' : m.username}
                {m.role === 'admin' && <span className="group-admin-badge">Admin</span>}
              </span>
              {isAdmin && m.id !== userId && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm({ kind: 'remove', member: m })} aria-label={`Remove ${m.username}`}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>

        {isAdmin && !adding && (
          <button type="button" className="btn btn-secondary btn-block group-info-gap" onClick={() => setAdding(true)}>
            Add people
          </button>
        )}
        {isAdmin && adding && (
          <div className="form-stack group-info-gap">
            <MemberPicker
              userId={userId}
              token={token}
              selectedIds={toAdd}
              onChange={setToAdd}
              excludeIds={group.members.map((m) => m.id)}
            />
            <div className="inline-form">
              <button type="button" className="btn btn-primary" onClick={addPeople} disabled={toAdd.length === 0}>
                Add {toAdd.length > 0 ? toAdd.length : ''}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setAdding(false); setToAdd([]); }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <button type="button" className="btn btn-block group-leave-btn" onClick={() => setConfirm({ kind: 'leave' })}>
          Leave group
        </button>
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={confirmAction}
        title={confirm?.kind === 'leave' ? 'Leave this group?' : `Remove ${confirm?.member?.username}?`}
        description={
          confirm?.kind === 'leave'
            ? "You'll stop getting its messages and won't see its history any more."
            : 'They will stop getting messages and lose access to the history.'
        }
        confirmLabel={confirm?.kind === 'leave' ? 'Leave' : 'Remove'}
        danger
        error={actionError}
      />
    </div>
  );
}

export default GroupInfoScreen;
