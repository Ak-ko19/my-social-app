import { createElement, lazy, Suspense, useCallback, useState } from 'react';
import ScreenLoadBoundary from '../components/layout/ScreenLoadBoundary';

// Days 114-115: React.lazy for a PART of a screen that only shows after a
// tap (comments, the share sheet, the report dialog, the story viewer), so
// its code leaves the first download (npm run check:bundle). Like
// lazyScreen, a failed download gets a way back -- here a compact line in
// place (Try again / Reload, and Close when the part has an onClose)
// instead of the app's crash screen. Nothing shows while it loads: these
// open on a tap and their code is small.
export function lazyPart(load) {
  let Lazy = lazy(load);
  function Part(props) {
    const [attempt, setAttempt] = useState(0);
    const retry = useCallback(() => {
      Lazy = lazy(load);
      setAttempt((n) => n + 1);
    }, []);
    return createElement(
      ScreenLoadBoundary,
      { key: attempt, onRetry: retry, compact: true, onClose: props.onClose },
      createElement(Suspense, { fallback: null }, createElement(Lazy, props)),
    );
  }
  return Part;
}
