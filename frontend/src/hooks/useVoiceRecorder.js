import { useCallback, useEffect, useRef, useState } from 'react';

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/mp4'];
const BAR_COUNT = 5;
const LEVEL_UPDATE_INTERVAL_MS = 100; // just needs to feel live, not render at 60fps
const TIMER_TICK_MS = 250;

function getSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || null;
}

// Chrome, Firefox, and Safari all throw a standard DOMException here, but
// which name they pick for a given real-world cause isn't identical across
// all three (and older/non-standard aliases still show up on some devices)
// -- normalized here into one clear, consistent message per actual cause,
// so the user's experience doesn't depend on which browser they're on.
//   - NotAllowedError: the user (or an OS/browser policy) denied access --
//     covers both "clicked Block" and "permanently denied in Settings"
//     equally on every browser, including iOS Safari, which doesn't
//     distinguish those two cases via a different error name either.
//   - NotFoundError: no microphone hardware exists at all.
//   - NotReadableError / TrackStartError: hardware exists but couldn't be
//     started -- almost always another app/tab already holding it.
//   - SecurityError: blocked by page context (not HTTPS, or an embedding
//     iframe missing a `microphone` Permissions-Policy/allow attribute).
function permissionErrorMessage(err) {
  if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
    return 'Microphone access was denied. Allow microphone access in your browser settings to send voice messages.';
  }
  if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
    return 'No microphone was found on this device.';
  }
  if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
    return 'Your microphone is already in use by another app or browser tab. Close it and try again.';
  }
  if (err?.name === 'SecurityError') {
    return 'Microphone access is blocked on this page. Make sure you\'re using a secure (https) connection.';
  }
  return 'Could not access the microphone. Please check your device and try again.';
}

// Hold-to-record voice messages via the native MediaRecorder API. Mirrors
// useTypingIndicator's self-contained timer/cleanup shape, extended with a
// mic-stream lifecycle (getUserMedia -> MediaRecorder -> AnalyserNode for the
// live level bars) that must all be torn down together every time recording
// ends, however it ends (sent, cancelled, hit the max duration, or the
// component unmounts mid-recording) -- leaving any of it dangling is what
// keeps a browser's "mic is active" indicator lit after the fact.
export function useVoiceRecorder({ onComplete, maxDurationSeconds = 120, warningThresholdSeconds = 105 } = {}) {
  const [status, setStatus] = useState('idle'); // idle | requesting-permission | recording | processing
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [level, setLevel] = useState(() => Array(BAR_COUNT).fill(0));
  const [permissionError, setPermissionError] = useState(null);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const levelIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  const releasedEarlyRef = useRef(false);
  const mimeTypeRef = useRef(null);
  const isMountedRef = useRef(true);

  const teardown = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (levelIntervalRef.current) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  // Belt-and-suspenders: releases the mic even if the component unmounts
  // mid-recording (e.g. navigating away from the conversation while holding).
  useEffect(() => teardown, [teardown]);

  // Separate from teardown's own unmount cleanup above: this flag guards
  // the specific window where the component unmounts WHILE getUserMedia is
  // still pending (navigating away during the permission prompt). teardown
  // runs immediately on that unmount, but at that instant streamRef.current
  // is still null -- there's nothing for it to release yet. If getUserMedia
  // then resolves afterward (asynchronously, on an already-unmounted
  // instance), startRecording's continuation checks this flag before ever
  // touching state or holding onto the stream, and stops it immediately
  // instead -- without this, that stream would stay open and the mic
  // indicator would stay lit indefinitely, since teardown's cleanup has
  // already run once and won't run again.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const finishRecording = useCallback((shouldSend) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    cancelledRef.current = !shouldSend;
    setStatus('processing');
    recorder.stop(); // recorder.onstop (set up in startRecording) does the rest
  }, []);

  const startRecording = useCallback(async () => {
    if (status !== 'idle') return;
    cancelledRef.current = false;
    releasedEarlyRef.current = false;
    setPermissionError(null);
    setStatus('requesting-permission');

    const mimeType = getSupportedMimeType();
    if (!mimeType) {
      setPermissionError('Voice messages are not supported in this browser.');
      setStatus('idle');
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (isMountedRef.current) {
        setPermissionError(permissionErrorMessage(err));
        setStatus('idle');
      }
      return;
    }

    // Either the user released before permission even resolved (a quick
    // tap, not a hold), or the component unmounted while the prompt was
    // still pending (navigated away) -- either way, don't start a real
    // recording: release the mic we were just granted and, only if still
    // mounted, go back to idle (setState on an unmounted instance is
    // pointless even though React 18 no-ops it safely).
    if (releasedEarlyRef.current || !isMountedRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      if (isMountedRef.current) setStatus('idle');
      return;
    }

    let recorder;
    try {
      // audioBitsPerSecond is a hint, not a hard guarantee (browsers may
      // adjust it for codec constraints), but explicitly requesting 64kbps
      // -- comfortably enough for clear speech -- keeps output size
      // predictable rather than depending on each browser's own default
      // (which isn't consistently documented and can vary meaningfully
      // between Chrome/Firefox/Safari and across versions). At 64kbps, even
      // the full 2-minute cap (see maxDurationSeconds) produces roughly
      // 64,000 * 120 / 8 = ~0.96MB -- well under the backend's 5MB limit,
      // with wide margin.
      recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      if (isMountedRef.current) {
        setPermissionError('Could not start recording on this device.');
        setStatus('idle');
      }
      return;
    }

    streamRef.current = stream;
    mimeTypeRef.current = mimeType;
    chunksRef.current = [];
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const wasCancelled = cancelledRef.current;
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      const durationSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      teardown();
      setStatus('idle');
      setElapsedSeconds(0);
      setLevel(Array(BAR_COUNT).fill(0));
      if (!wasCancelled && blob.size > 0) {
        onComplete?.(blob, durationSeconds, mimeTypeRef.current);
      }
    };

    // AnalyserNode for the live level bars -- a lightweight stand-in for a
    // real waveform (sampled a few times a second, not every animation
    // frame, since the bars only need to feel "live"). Optional: if
    // AudioContext isn't available for some reason, recording still works,
    // the bars just stay flat.
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      try {
        const audioContext = new AudioContextClass();
        // Some mobile browsers (notably iOS Safari) create a new
        // AudioContext already 'suspended', or auto-suspend one shortly
        // after creation/backgrounding -- .resume() is itself a
        // user-gesture-gated call, but calling it here is still safe/
        // effective because startRecording is only ever invoked from
        // directly inside a mousedown/touchstart handler (see
        // VoiceRecorderButton), so this whole call chain carries that
        // gesture's transient activation. Not awaited: the level bars are
        // decorative, so there's no reason to delay actual recording start
        // on this resolving -- if it stays suspended a moment longer, the
        // bars just stay flat until it catches up.
        if (audioContext.state === 'suspended') {
          audioContext.resume().catch(() => {});
        }
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioContextRef.current = audioContext;

        const data = new Uint8Array(analyser.frequencyBinCount);
        const step = Math.max(1, Math.floor(data.length / BAR_COUNT));
        levelIntervalRef.current = setInterval(() => {
          analyser.getByteFrequencyData(data);
          const bars = Array.from({ length: BAR_COUNT }, (_, i) => Math.min(1, data[i * step] / 200));
          setLevel(bars);
        }, LEVEL_UPDATE_INTERVAL_MS);
      } catch {
        // Non-fatal -- recording itself doesn't depend on the analyser.
      }
    }

    startedAtRef.current = Date.now();
    recorder.start();
    setStatus('recording');

    timerIntervalRef.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsedSeconds(seconds);
      if (seconds >= maxDurationSeconds) {
        finishRecording(true); // auto-stop-and-send at the cap
      }
    }, TIMER_TICK_MS);
  }, [status, maxDurationSeconds, teardown, finishRecording, onComplete]);

  const stopAndSend = useCallback(() => {
    if (status === 'requesting-permission') {
      releasedEarlyRef.current = true;
      return;
    }
    finishRecording(true);
  }, [status, finishRecording]);

  const cancel = useCallback(() => {
    if (status === 'requesting-permission') {
      releasedEarlyRef.current = true;
      setStatus('idle');
      return;
    }
    finishRecording(false);
  }, [status, finishRecording]);

  return {
    status,
    elapsedSeconds,
    level,
    permissionError,
    nearingLimit: elapsedSeconds >= warningThresholdSeconds,
    maxDurationSeconds,
    startRecording,
    stopAndSend,
    cancel
  };
}
