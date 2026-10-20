import { useCallback } from 'react';
import { sendVoiceMessageRest, sendImageMessageRest } from '../services/messageService';
import { buildReplyPreview, makeClientTempId } from '../utils/chatMessages';

// Day 71 (split out of useConversationMessages, which passes in its message
// state): sending voice notes and photos. A file isn't something you emit
// over the socket, so both are always REST, unlike text's socket-first send.
// Each shows an optimistic bubble at once, playing / showing a local blob:
// URL with upload progress; the saved row then replaces it (or the bubble is
// marked failed, keeping the file so a retry needn't record or pick again).
//
// clientTempId round-trips through the upload and comes back on the saved
// row, so the new_message broadcast this sender's own socket also receives
// is matched and de-duplicated by mergeMessages exactly like a text send's
// ack: whichever of the two arrives first replaces the optimistic row, and
// the other is a harmless re-merge of the same real row.
// The still-optimistic row for this clientTempId.
const isOptimistic = (clientTempId) => (m) => m.client_temp_id === clientTempId && m.id == null;

export function useMediaMessages({ conversationId, conversationIdNum, token, currentUserId, setMessages, mergeMessages }) {
  // Runs one upload for the optimistic row clientTempId. `send` makes the
  // request, given the progress callback.
  const upload = useCallback(
    (clientTempId, localUrl, send) => {
      const mine = isOptimistic(clientTempId);
      send({
        onUploadProgress: (progressEvent) => {
          if (!progressEvent.total) return;
          const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          setMessages((current) => current.map((m) => (mine(m) ? { ...m, _uploadProgress: percent } : m)));
        }
      })
        .then((saved) => {
          // The stored file is in use now -- the local blob: URL isn't needed.
          URL.revokeObjectURL(localUrl);
          mergeMessages([saved]);
        })
        .catch((err) => {
          console.error(err);
          // Deliberately NOT revoking localUrl: the failed bubble still plays
          // or shows what was sent, and a retry re-uploads the same file.
          setMessages((current) => current.map((m) => (mine(m) ? { ...m, status: 'failed', _uploadProgress: 0 } : m)));
        });
    },
    [setMessages, mergeMessages]
  );

  // A retry removes the failed bubble (and its blob: URL) and sends afresh
  // with a NEW clientTempId -- same reasoning as text's retrySend: a late
  // answer for the original attempt must not collide with the retry's row.
  // Revoking inside the updater is safe even if it runs twice (StrictMode).
  const dropFailed = useCallback(
    (failedClientTempId) => {
      const mine = isOptimistic(failedClientTempId);
      setMessages((current) => {
        const failed = current.find(mine);
        if (failed?.media_url) URL.revokeObjectURL(failed.media_url);
        return current.filter((m) => !mine(m));
      });
    },
    [setMessages]
  );

  const optimistic = useCallback(
    (clientTempId, type, localUrl, extra) => ({
      id: null,
      client_temp_id: clientTempId,
      conversation_id: conversationIdNum,
      sender_id: currentUserId,
      content: null,
      type,
      media_url: localUrl,
      status: 'sending',
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      // Client-only bookkeeping (underscored fields), never on a real server
      // row, so they disappear when mergeMessages swaps in the saved one.
      _uploadProgress: 0, // 0-100; MessageBubble decides whether to show it
      ...extra
    }),
    [conversationIdNum, currentUserId]
  );

  const sendVoiceMessage = useCallback(
    (blob, durationSeconds) => {
      const clientTempId = makeClientTempId();
      const localUrl = URL.createObjectURL(blob);
      mergeMessages([optimistic(clientTempId, 'voice', localUrl, { duration_seconds: durationSeconds ?? null, _voiceBlob: blob })]);
      upload(clientTempId, localUrl, (options) => sendVoiceMessageRest(conversationId, blob, clientTempId, token, options));
    },
    [conversationId, token, mergeMessages, optimistic, upload]
  );

  // Reuses the SAME cached blob (the failed bubble's _voiceBlob): the whole
  // point is never having to re-record.
  const retryVoiceSend = useCallback(
    (failedClientTempId, blob, durationSeconds) => {
      dropFailed(failedClientTempId);
      sendVoiceMessage(blob, durationSeconds);
    },
    [dropFailed, sendVoiceMessage]
  );

  // B9: a photo, optionally as a reply.
  const sendImageMessage = useCallback(
    (file, replyTo = null) => {
      if (!file) return;
      const clientTempId = makeClientTempId();
      const localUrl = URL.createObjectURL(file);
      mergeMessages([optimistic(clientTempId, 'image', localUrl, {
        reply_to_message_id: replyTo ? replyTo.id : null,
        reply_to: buildReplyPreview(replyTo),
        _imageFile: file // kept so a failed upload can be retried
      })]);
      upload(clientTempId, localUrl, (options) => sendImageMessageRest(conversationId, file, clientTempId, token, {
        ...options,
        replyToMessageId: replyTo ? replyTo.id : null
      }));
    },
    [conversationId, token, mergeMessages, optimistic, upload]
  );

  const retryImageSend = useCallback(
    (failedClientTempId, file, replyTo = null) => {
      dropFailed(failedClientTempId);
      sendImageMessage(file, replyTo);
    },
    [dropFailed, sendImageMessage]
  );

  return { sendVoiceMessage, retryVoiceSend, sendImageMessage, retryImageSend };
}
