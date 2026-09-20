import { useContext } from 'react';
import VoicePlaybackContext from '../context/VoicePlaybackContext';

export function useVoicePlayback() {
  const ctx = useContext(VoicePlaybackContext);
  if (!ctx) {
    throw new Error('useVoicePlayback must be used within a VoicePlaybackProvider');
  }
  return ctx;
}
