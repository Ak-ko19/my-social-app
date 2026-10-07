import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { fetchPost, votePoll } from '../../services/postService';
import { serverErrorText } from '../../utils/serverError';
import './PollView.css';

// "3 days left" / "5 hours left" / "10 minutes left" -- rounded, so a
// 3-day poll posted a moment ago says 3 days, not 2.
function timeLeftKey(closesAt, now) {
  const ms = new Date(closesAt).getTime() - now;
  if (ms >= 86400000) return ['poll.daysLeft', Math.round(ms / 86400000)];
  if (ms >= 3600000) return ['poll.hoursLeft', Math.round(ms / 3600000)];
  return ['poll.minutesLeft', Math.max(1, Math.ceil(ms / 60000))];
}

// Day 44: a poll post's options (before you vote) or results (after you
// vote, on your own poll, and for everyone once it has ended -- the server
// only sends the counts then). One vote, which can't be changed.
function PollView({ postId, poll: initialPoll }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [poll, setPoll] = useState(initialPoll);
  const [choosing, setChoosing] = useState(null); // option id being sent
  const [error, setError] = useState('');
  // The time, as state (not Date.now() during render), ticking each minute
  // so "minutes left" stays right and the poll ends on screen.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const closed = poll.closed || new Date(poll.closes_at).getTime() <= now;

  const vote = (optionId) => {
    if (choosing) return;
    if (!token) {
      navigate('/login');
      return;
    }
    setChoosing(optionId);
    setError('');
    votePoll(postId, optionId, token)
      .then(setPoll)
      .catch((err) => {
        console.error(err);
        setError(serverErrorText(err, 'poll.voteFailed'));
        // Voted on another device, or it just ended: show where it stands.
        if (err.response?.status === 409) {
          fetchPost(postId, token).then((post) => post.poll && setPoll(post.poll)).catch(() => {});
        }
      })
      .finally(() => setChoosing(null));
  };

  const top = Math.max(0, ...poll.options.map((o) => o.votes ?? 0));
  const percent = (votes) => (poll.total_votes > 0 ? Math.round((votes / poll.total_votes) * 100) : 0);
  const [leftKey, leftCount] = timeLeftKey(poll.closes_at, now);

  return (
    <section className="poll" aria-label={t('poll.label')}>
      {poll.show_results ? (
        <ul className="poll-results">
          {poll.options.map((o) => {
            const mine = poll.my_vote === o.id;
            const pct = percent(o.votes);
            return (
              <li key={o.id} className={clsx('poll-result', mine && 'is-mine', top > 0 && o.votes === top && 'is-leading')}>
                <span className="poll-result-bar" style={{ inlineSize: `${pct}%` }} aria-hidden="true" />
                <span className="poll-result-label">
                  <bdi>{o.label}</bdi>
                  {mine && <Check size={15} className="poll-result-mine" aria-label={t('poll.yourVote')} />}
                </span>
                <span className="poll-result-percent">
                  {t('poll.percent', { value: pct })}
                  <span className="feed-visually-hidden">{t('poll.votes', { count: o.votes })}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="poll-options">
          {poll.options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className={clsx('poll-option', choosing === o.id && 'is-choosing')}
                onClick={() => vote(o.id)}
                disabled={Boolean(choosing) || closed}
                aria-busy={choosing === o.id || undefined}
              >
                <bdi>{o.label}</bdi>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="poll-error" role="alert">{error}</p>}
      <p className="poll-footer">
        {t('poll.totalVotes', { count: poll.total_votes })}
        {' · '}
        {/* Ended while on screen, before the results were loaded: no
            "final results" to point at yet. */}
        {closed ? t(poll.show_results ? 'poll.finalResults' : 'poll.ended') : t(leftKey, { count: leftCount })}
      </p>
    </section>
  );
}

export default PollView;
