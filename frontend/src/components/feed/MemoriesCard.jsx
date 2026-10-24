import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarHeart, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMemories } from '../../hooks/useMemories';
import './MemoriesCard.css';

const HIDDEN_KEY = 'memoriesHidden'; // "<userId>:<date>" -- cleared on logout (useAuth)

function readHidden() {
  try {
    return localStorage.getItem(HIDDEN_KEY);
  } catch {
    return null;
  }
}

// Days 83-84: "On this day" on Home -- only when there are memories today,
// and until you hide it for the day.
function MemoriesCard({ token, userId }) {
  const { t } = useTranslation();
  const { data } = useMemories(token);
  const [hidden, setHidden] = useState(readHidden);
  if (!data || data.memories.length === 0) return null;
  const key = `${userId}:${data.date}`;
  if (hidden === key) return null;

  const newest = data.memories[0];
  const preview = newest.posts.find((p) => p.content)?.content;
  const hide = () => {
    try {
      localStorage.setItem(HIDDEN_KEY, key);
    } catch {
      // Private mode: it hides for this visit only.
    }
    setHidden(key);
  };

  return (
    <section className="memories-card" aria-labelledby="memories-card-title">
      <span className="memories-card-icon" aria-hidden="true"><CalendarHeart size={20} /></span>
      <div className="memories-card-body">
        <h2 id="memories-card-title" className="memories-card-title">{t('memories.cardTitle')}</h2>
        <p className="memories-card-text">{t('memories.cardText', { count: newest.yearsAgo })}</p>
        {preview && <p className="memories-card-quote" dir="auto">“{preview}”</p>}
        <Link to="/memories" className="btn btn-secondary btn-sm memories-card-open">{t('memories.open')}</Link>
      </div>
      <button type="button" className="memories-card-hide" onClick={hide} aria-label={t('memories.hideToday')} title={t('memories.hideToday')}>
        <X size={16} aria-hidden="true" />
      </button>
    </section>
  );
}

export default MemoriesCard;
