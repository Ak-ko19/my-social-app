import VerifiedTick from './VerifiedTick';

// Day 106: a name followed by the blue tick when `verified`. A long name is
// cut with "…" while the tick stays in view (it sits outside the cut text).
// `as` is the element (a heading or a span); the rest goes on it.
function NameWithTick({ name, verified, as: Tag = 'span', className, tickSize = 16, ...rest }) {
  return (
    <Tag className={className ? `name-with-tick ${className}` : 'name-with-tick'} {...rest}>
      <span className="name-with-tick-text" dir="auto">{name}</span>
      {verified && <VerifiedTick size={tickSize} className="name-with-tick-mark" />}
    </Tag>
  );
}

export default NameWithTick;
