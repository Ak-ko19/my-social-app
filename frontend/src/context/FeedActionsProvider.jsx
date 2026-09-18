import FeedActionsContext from './FeedActionsContext';

export function FeedActionsProvider({ value, children }) {
  return <FeedActionsContext.Provider value={value}>{children}</FeedActionsContext.Provider>;
}
