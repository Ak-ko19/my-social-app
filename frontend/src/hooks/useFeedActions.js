import { useContext } from 'react';
import FeedActionsContext from '../context/FeedActionsContext';

export function useFeedActions() {
  const ctx = useContext(FeedActionsContext);
  if (!ctx) {
    throw new Error('useFeedActions must be used within a FeedActionsProvider');
  }
  return ctx;
}
