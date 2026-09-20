import { createContext } from 'react';

// { requestPlay: (audioEl: HTMLAudioElement) => void, releaseIfCurrent: (audioEl: HTMLAudioElement) => void }
const VoicePlaybackContext = createContext(null);

export default VoicePlaybackContext;
