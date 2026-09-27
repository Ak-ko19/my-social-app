// Plain data, display order = array order. This is the ONLY place that
// needs to change to add a new super-app category later -- append a new
// object to the end and a new row appears automatically in MenuScreen
// (which just maps over this array, no numbering, no other wiring). See
// MenuScreen.jsx for how `icon` (a lucide-react export name, as a string)
// gets resolved to an actual icon component. Titles/subtitles are i18n
// keys: menu.categories.<key>.title / .subtitle (B15).
const SUPER_APP_CATEGORIES = [
  { key: 'news', icon: 'Newspaper', bg: '#FEE2E2', fg: '#DC2626' },
  { key: 'jobs', icon: 'Briefcase', bg: '#DBEAFE', fg: '#2563EB' },
  { key: 'identity', icon: 'UserCircle', bg: '#EDE9FE', fg: '#7C3AED' },
  { key: 'payments', icon: 'Wallet', bg: '#D1FAE5', fg: '#059669' },
  { key: 'communication', icon: 'MessageSquare', bg: '#E0E7FF', fg: '#4338CA' },
  { key: 'ecommerce', icon: 'ShoppingBag', bg: '#FFEDD5', fg: '#EA580C' },
  { key: 'food', icon: 'UtensilsCrossed', bg: '#DCFCE7', fg: '#16A34A' },
  { key: 'transport', icon: 'Car', bg: '#E0E7FF', fg: '#4F46E5' },
  { key: 'travel', icon: 'Plane', bg: '#CFFAFE', fg: '#0891B2' },
  { key: 'finance', icon: 'Landmark', bg: '#FEF3C7', fg: '#D97706' },
  { key: 'government', icon: 'Building2', bg: '#E5E7EB', fg: '#374151' },
  { key: 'healthcare', icon: 'HeartPulse', bg: '#FCE7F3', fg: '#DB2777' },
  { key: 'education', icon: 'GraduationCap', bg: '#EDE9FE', fg: '#6D28D9' },
  { key: 'entertainment', icon: 'Clapperboard', bg: '#FFE4E6', fg: '#E11D48' },
  { key: 'utilities', icon: 'Wrench', bg: '#CCFBF1', fg: '#0D9488' },
  { key: 'ai-search', icon: 'Sparkles', bg: '#DDD6FE', fg: '#7C3AED' },
  { key: 'mini-apps', icon: 'Code2', bg: '#E5E7EB', fg: '#111827' },
  { key: 'rewards', icon: 'Star', bg: '#FEF9C3', fg: '#CA8A04' },
];

export default SUPER_APP_CATEGORIES;
