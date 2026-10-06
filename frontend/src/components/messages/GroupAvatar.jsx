import { Users } from 'lucide-react';
import Avatar from '../common/Avatar';

// Day 34: a group chat's picture -- its photo when an admin has set one,
// otherwise the group glyph (as before, B10). Decorative: the group's name
// is always next to it.
function GroupAvatar({ src, size = 48 }) {
  if (src) return <Avatar src={src} size={size} alt="" className="messages-group-photo" />;
  return (
    <span className="messages-group-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <Users size={Math.round(size * 0.46)} />
    </span>
  );
}

export default GroupAvatar;
