import { useCallback, useRef } from 'react';
import VoicePlaybackContext from './VoicePlaybackContext';

// Coordinates "only one voice message plays at a time" across the whole
// chat window. Deliberately a plain ref, not React state -- switching which
// bubble is playing doesn't need to re-render every OTHER bubble, it only
// needs to pause whichever <audio> element was previously playing before a
// new one starts. Calling .pause() on that other element fires ITS OWN
// native 'pause' event, which that bubble's own VoiceMessagePlayer instance
// already listens for to keep its own play/pause UI in sync -- this
// provider never reaches into any bubble's React state directly, it only
// ever touches the one previously-registered <audio> DOM node.
export function VoicePlaybackProvider({ children }) {
  const currentAudioRef = useRef(null);

  // Called right before a player calls audioEl.play() on itself.
  const requestPlay = useCallback((audioEl) => {
    if (currentAudioRef.current && currentAudioRef.current !== audioEl) {
      currentAudioRef.current.pause();
    }
    currentAudioRef.current = audioEl;
  }, []);

  // Called whenever a player's own audio element pauses/ends/unmounts --
  // only clears the slot if THIS element was the one holding it, so an
  // already-superseded element's own cleanup can't clobber whichever one is
  // actually playing now.
  const releaseIfCurrent = useCallback((audioEl) => {
    if (currentAudioRef.current === audioEl) {
      currentAudioRef.current = null;
    }
  }, []);

  return (
    <VoicePlaybackContext.Provider value={{ requestPlay, releaseIfCurrent }}>{children}</VoicePlaybackContext.Provider>
  );
}
