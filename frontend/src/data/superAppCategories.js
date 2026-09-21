// Plain data, display order = array order. This is the ONLY place that
// needs to change to add a new super-app category later -- append a new
// object to the end and a new row appears automatically in MenuScreen
// (which just maps over this array, no numbering, no other wiring). See
// MenuScreen.jsx for how `icon` (a lucide-react export name, as a string)
// gets resolved to an actual icon component.
const SUPER_APP_CATEGORIES = [
  { key: 'news', title: 'News', subtitle: 'Latest news & trending stories', icon: 'Newspaper', bg: '#FEE2E2', fg: '#DC2626' },
  { key: 'jobs', title: 'Jobs', subtitle: 'Find your dream job', icon: 'Briefcase', bg: '#DBEAFE', fg: '#2563EB' },
  { key: 'identity', title: 'User Identity & Account', subtitle: 'Manage your profile & identity', icon: 'UserCircle', bg: '#EDE9FE', fg: '#7C3AED' },
  { key: 'payments', title: 'Payments & Wallet', subtitle: 'Pay bills, send & receive money', icon: 'Wallet', bg: '#D1FAE5', fg: '#059669' },
  { key: 'communication', title: 'Communication & Social Networking', subtitle: 'Chat, call & connect with people', icon: 'MessageSquare', bg: '#E0E7FF', fg: '#4338CA' },
  { key: 'ecommerce', title: 'E-commerce & Marketplace', subtitle: 'Shop, sell & grow your business', icon: 'ShoppingBag', bg: '#FFEDD5', fg: '#EA580C' },
  { key: 'food', title: 'Food & Grocery', subtitle: 'Order food & daily essentials', icon: 'UtensilsCrossed', bg: '#DCFCE7', fg: '#16A34A' },
  { key: 'transport', title: 'Transportation', subtitle: 'Ride, drive & travel easily', icon: 'Car', bg: '#E0E7FF', fg: '#4F46E5' },
  { key: 'travel', title: 'Travel & Booking', subtitle: 'Book flights, hotels & experiences', icon: 'Plane', bg: '#CFFAFE', fg: '#0891B2' },
  { key: 'finance', title: 'Financial Services', subtitle: 'Banking, loans & insurance', icon: 'Landmark', bg: '#FEF3C7', fg: '#D97706' },
  { key: 'government', title: 'Government & Public Services', subtitle: 'Access government services', icon: 'Building2', bg: '#E5E7EB', fg: '#374151' },
  { key: 'healthcare', title: 'Healthcare', subtitle: 'Health, wellness & medical care', icon: 'HeartPulse', bg: '#FCE7F3', fg: '#DB2777' },
  { key: 'education', title: 'Education', subtitle: 'Learn, grow & build your future', icon: 'GraduationCap', bg: '#EDE9FE', fg: '#6D28D9' },
  { key: 'entertainment', title: 'Entertainment & Media', subtitle: 'Movies, music, gaming & more', icon: 'Clapperboard', bg: '#FFE4E6', fg: '#E11D48' },
  { key: 'utilities', title: 'Utilities & Daily Services', subtitle: 'Bills, top-ups & everyday services', icon: 'Wrench', bg: '#CCFBF1', fg: '#0D9488' },
  { key: 'ai-search', title: 'AI & Search', subtitle: 'Smart search & AI assistant', icon: 'Sparkles', bg: '#DDD6FE', fg: '#7C3AED' },
  { key: 'mini-apps', title: 'Mini App Platform & Developer', subtitle: 'Build & explore mini apps', icon: 'Code2', bg: '#E5E7EB', fg: '#111827' },
  { key: 'rewards', title: 'Loyalty & Rewards', subtitle: 'Earn points & enjoy rewards', icon: 'Star', bg: '#FEF9C3', fg: '#CA8A04' },
];

export default SUPER_APP_CATEGORIES;
