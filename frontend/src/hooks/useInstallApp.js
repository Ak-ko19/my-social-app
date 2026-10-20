import { useEffect, useState } from 'react';
import { canPromptInstall, isIos, isStandalone, onInstallChange, promptInstall } from '../utils/installPrompt';

// Day 72: how this browser can install the app -- 'prompt' (its own install
// dialog), 'ios' (Safari's Share > Add to Home Screen), or null (already
// installed, or not offered here).
function currentMode() {
  if (isStandalone()) return null;
  if (canPromptInstall()) return 'prompt';
  if (isIos()) return 'ios';
  return null;
}

export function useInstallApp() {
  const [mode, setMode] = useState(currentMode);
  useEffect(() => onInstallChange(() => setMode(currentMode())), []);
  return { mode, install: promptInstall };
}
