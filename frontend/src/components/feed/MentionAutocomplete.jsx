import { Avatar } from '../ui';
import { resolveImageUrl } from '../../api';
import './MentionAutocomplete.css';

// Dropdown of matching users shown under a composer while an "@partial"
// mention is being typed -- see hooks/useMentionAutocomplete.
function MentionAutocomplete({ suggestions, onSelect }) {
  if (suggestions.length === 0) return null;

  return (
    <ul className="mention-autocomplete" role="listbox">
      {suggestions.map((user) => (
        <li key={user.id}>
          <button type="button" className="mention-autocomplete-item" onClick={() => onSelect(user)}>
            <Avatar
              size={28}
              src={resolveImageUrl(user.avatar_url)}
              initials={(user.username || '?').slice(0, 2).toUpperCase()}
              alt=""
            />
            <span>{user.username}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default MentionAutocomplete;
