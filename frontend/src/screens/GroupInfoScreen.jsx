import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton, ConfirmDialog } from '../components/ui';
import Avatar from '../components/common/Avatar';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import MemberPicker from '../components/messages/MemberPicker';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useTranslation } from 'react-i18next';
import { serverErrorText } from '../utils/serverError';
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
  const { t } = useTranslation();
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
          setLoadError(t('groupChat.notMember'));
          return;
        }
        console.error(err);
        setLoadError(t('groupChat.loadFailed'));
      });
  }, [conversationId, token, t]);

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
          <IconButton icon={ChevronLeft} aria-label={t('messages.backToMessages')} onClick={() => navigate('/messages')} />
          <h1 className="screen-header-title">{t('groupChat.info')}</h1>
        </header>
        <FeedErrorState message={loadError} onRetry={load} />
      </div>
    );
  }
  if (!group) return <p className="screen-status" role="status">{t('common.loading')}</p>;

  const isAdmin = group.my_role === 'admin';
  const run = (promise) => {
    setActionError('');
    return promise.catch((err) => {
      console.error(err);
      setActionError(serverErrorText(err, 'common.somethingWentWrong'));
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
        <IconButton icon={ChevronLeft} aria-label={t('groupChat.backToChat')} onClick={() => navigate(`/messages/${conversationId}`)} />
        <h1 className="screen-header-title">{t('groupChat.info')}</h1>
      </header>

      <div className="screen-body">
        {renaming ? (
          <form className="inline-form" onSubmit={saveName}>
            <label className="feed-visually-hidden" htmlFor="group-name-input">{t('groupChat.groupName')}</label>
            <input id="group-name-input" className="form-input" maxLength={100} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} autoFocus />
            <button type="submit" className="btn btn-primary" disabled={!nameDraft.trim()}>{t('common.save')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setRenaming(false)}>{t('common.cancel')}</button>
          </form>
        ) : (
          <div className="group-info-title">
            <h2 className="group-info-name">{group.name}</h2>
            {isAdmin && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setNameDraft(group.name); setRenaming(true); }}>
                {t('groupChat.rename')}
              </button>
            )}
          </div>
        )}

        {actionError && <p className="form-error" role="alert">{actionError}</p>}

        <h3 className="section-heading">{t('messages.memberCount', { count: group.members.length })}</h3>
        <ul className="card-list">
          {group.members.map((m) => (
            <li key={m.id} className="card-row group-member-row">
              <Avatar src={m.avatar_url} size={36} alt="" />
              <span className="card-row-body">
                {m.id === userId ? t('messages.you') : m.username}
                {m.role === 'admin' && <span className="group-admin-badge">{t('groupChat.admin')}</span>}
              </span>
              {isAdmin && m.id !== userId && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm({ kind: 'remove', member: m })} aria-label={t('groupChat.removeName', { name: m.username })}>
                  {t('groupChat.remove')}
                </button>
              )}
            </li>
          ))}
        </ul>

        {isAdmin && !adding && (
          <button type="button" className="btn btn-secondary btn-block group-info-gap" onClick={() => setAdding(true)}>
            {t('groupChat.addPeople')}
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
                {toAdd.length > 0 ? t('groupChat.addCount', { count: toAdd.length }) : t('groupChat.add')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setAdding(false); setToAdd([]); }}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        <button type="button" className="btn btn-block group-leave-btn" onClick={() => setConfirm({ kind: 'leave' })}>
          {t('groupChat.leaveGroup')}
        </button>
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={confirmAction}
        title={confirm?.kind === 'leave' ? t('groupChat.leaveTitle') : t('groupChat.removeTitle', { name: confirm?.member?.username })}
        description={
          confirm?.kind === 'leave'
            ? t('groupChat.leaveDescription')
            : t('groupChat.removeDescription')
        }
        confirmLabel={confirm?.kind === 'leave' ? t('groupChat.leave') : t('groupChat.remove')}
        danger
        error={actionError}
      />
    </div>
  );
}

export default GroupInfoScreen;
