// Solid blue circle + white checkmark. Hand-rolled inline SVG rather than
// a lucide icon (e.g. BadgeCheck) on purpose: lucide icons are line art
// (fill="none", stroke="currentColor"), so getting a genuinely SOLID
// circle with a contrasting checkmark out of one reliably would mean
// depending on that icon's internal path structure. This gives full,
// certain control over which part is filled vs stroked, and matches the
// plain-inline-SVG convention already used elsewhere for small status
// icons (see components/messages/MessageStatusIcon.jsx).
function VerifiedTick({ size = 16, className, ...rest }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      aria-label="Verified"
      {...rest}
    >
      <circle cx="8" cy="8" r="8" fill="var(--color-accent-2)" />
      <path
        d="M4.5 8.2 6.8 10.5 11.5 5.5"
        fill="none"
        stroke="var(--color-surface)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default VerifiedTick;
