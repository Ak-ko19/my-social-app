import { createElement, lazy, useCallback, useState } from 'react';
import ScreenLoadBoundary from '../components/layout/ScreenLoadBoundary';

// Day 80: React.lazy for screens, with a way back from a failed download.
// React.lazy remembers a failed import for good, so "Try again" builds a
// fresh one; ScreenLoadBoundary shows what happened meanwhile (offline, or
// a new version) instead of the app's crash screen.
export function lazyScreen(load) {
  let Lazy = lazy(load);
  function Screen(props) {
    const [attempt, setAttempt] = useState(0);
    const retry = useCallback(() => {
      Lazy = lazy(load);
      setAttempt((n) => n + 1);
    }, []);
    return createElement(ScreenLoadBoundary, { key: attempt, onRetry: retry }, createElement(Lazy, props));
  }
  return Screen;
}
