import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoicePlayback } from '../../hooks/useVoicePlayback';
import { useTranslation } from 'react-i18next';

const WAVEFORM_BAR_COUNT = 24;

function hashSeed(key) {
  let hash = 0;
  const str = String(key);
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// Deterministic per-message pseudo-random bar heights -- a decorative
// stand-in for a real waveform (Cloudinary's upload response doesn't
// include actual sample data), seeded so the SAME message always renders
// the SAME pattern rather than jittering on every re-render.
function generateWaveformHeights(seedKey) {
  const seed = hashSeed(seedKey);
  return Array.from({ length: WAVEFORM_BAR_COUNT }, (_, i) => {
    const n = Math.sin(seed + i * 12.9898) * 43758.5453;
    return 0.3 + (n - Math.floor(n)) * 0.7; // 0.3-1.0 -- never a flat-looking bar
  });
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="M7 5v14l12-7z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" fill="currentColor" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="M12 2 1 21h22L12 2Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <line x1="12" y1="9" x2="12" y2="14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

// Custom playback UI over a hidden native <audio> element -- play/pause,
// a click-or-drag-to-seek waveform/progress bar, loading and error states.
// currentColor-driven throughout (see Messages.css) so it automatically
// matches whichever bubble variant (own/other) it's rendered inside,
// without needing to know which one that is itself.
//
// Works identically whether `message` came from REST pagination or a live
// socket new_message event -- both land in useConversationMessages' same
// `messages` array and get rendered through this same component either way,
// nothing here depends on how the message arrived.
//
// One playback slot for the whole chat window (see VoicePlaybackProvider):
// this component only ever reads/writes its OWN <audio> element; pausing
// whichever OTHER bubble was playing is the provider's job, done by calling
// .pause() on that other element -- which fires THAT element's own 'pause'
// listener below, keeping its state in sync without any cross-component
// coordination beyond the provider itself.
function VoiceMessagePlayer({ src, durationSeconds, seedKey }) {
  const { t } = useTranslation();
  const audioRef = useRef(null);
  const barRef = useRef(null);
  const { requestPlay, releaseIfCurrent } = useVoicePlayback();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [waveformHeights] = useState(() => generateWaveformHeights(seedKey));

  // durationSeconds (the app's own recorded/persisted value) is preferred
  // over the <audio> element's own .duration -- MediaRecorder-produced
  // webm/blob audio is known to sometimes report Infinity for .duration
  // until the whole stream has loaded, so trusting our own known-good value
  // avoids that entirely; audioDuration is only a fallback for the rare
  // case durationSeconds is missing.
  const duration = durationSeconds ?? audioDuration ?? 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      releaseIfCurrent(audio);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      releaseIfCurrent(audio);
    };
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => {
      if (Number.isFinite(audio.duration)) setAudioDuration(audio.duration);
    };
    const handleWaiting = () => setIsBuffering(true);
    const handleCanPlay = () => setIsBuffering(false);
    const handleError = () => {
      setHasError(true);
      setIsBuffering(false);
      setIsPlaying(false);
      releaseIfCurrent(audio);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('loadedmetadata', handleDurationChange);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('loadedmetadata', handleDurationChange);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
      releaseIfCurrent(audio);
    };
  }, [releaseIfCurrent]);

  // No effect resetting state when `src` changes: an optimistic voice
  // bubble's local blob: URL becomes the real Cloudinary URL by way of
  // useConversationMessages replacing the message object with `id` now set,
  // which changes the list item's React key (id ?? client_temp_id) in
  // Conversation.jsx -- that already fully unmounts/remounts this component
  // rather than reusing this instance with a new `src` prop, so there's
  // nothing here to reset.

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || hasError) return;
    if (audio.paused) {
      requestPlay(audio);
      audio.play().catch(() => setHasError(true));
    } else {
      audio.pause();
    }
  }, [hasError, requestPlay]);

  const seekToClientX = useCallback(
    (clientX) => {
      const audio = audioRef.current;
      const bar = barRef.current;
      if (!audio || !bar || !duration) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const newTime = ratio * duration;
      audio.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration]
  );

  // Drag tracking only attached while actively dragging THIS bar -- mirrors
  // VoiceRecorderButton's slide-to-cancel gesture handling (window-level
  // listeners, clientX-based, torn down the moment the drag ends).
  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e) => seekToClientX(e.clientX);
    const handleTouchMove = (e) => {
      if (e.touches[0]) seekToClientX(e.touches[0].clientX);
      e.preventDefault(); // don't let the message thread scroll while dragging the seek bar
    };
    const stopDragging = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('touchend', stopDragging);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('touchend', stopDragging);
    };
  }, [isDragging, seekToClientX]);

  const handleBarMouseDown = (e) => {
    if (!duration || hasError) return;
    setIsDragging(true);
    seekToClientX(e.clientX);
  };
  const handleBarTouchStart = (e) => {
    if (!duration || hasError) return;
    e.preventDefault();
    setIsDragging(true);
    if (e.touches[0]) seekToClientX(e.touches[0].clientX);
  };

  const playedRatio = duration ? Math.min(1, currentTime / duration) : 0;
  const playedBarCount = Math.round(playedRatio * WAVEFORM_BAR_COUNT);

  return (
    <div className="voice-player">
      {/* No native controls -- this whole component is the accessible
          surface (play button, seek slider, time text below); the element
          itself is just the playback engine. */}
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        className="voice-player-toggle"
        onClick={togglePlayback}
        disabled={hasError}
        aria-label={hasError ? t('messages.voiceLoadFailed') : isPlaying ? t('messages.pauseVoice') : t('messages.playVoice')}
      >
        {hasError ? <ErrorIcon /> : isBuffering ? <span className="voice-player-spinner" aria-hidden="true" /> : isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div className="voice-player-body">
        <div
          ref={barRef}
          className={`voice-player-bar${hasError ? ' voice-player-bar-disabled' : ''}`}
          onMouseDown={handleBarMouseDown}
          onTouchStart={handleBarTouchStart}
          role="slider"
          aria-label={t('messages.seekVoice')}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          aria-disabled={hasError}
        >
          {waveformHeights.map((h, i) => (
            <span
              key={i}
              className={`voice-player-bar-segment${i < playedBarCount ? ' voice-player-bar-segment-played' : ''}`}
              style={{ height: `${h * 100}%` }}
            />
          ))}
        </div>
        <div className="voice-player-time">{hasError ? t('messages.audioFailed') : `${formatTime(currentTime)} / ${formatTime(duration)}`}</div>
      </div>
    </div>
  );
}

export default VoiceMessagePlayer;
