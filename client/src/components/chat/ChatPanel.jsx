import React, { useState, useEffect, useRef, useCallback } from 'react';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import { getMessages } from '@/services/chat';
import { uploadFile } from '@/services/files';
import { useSocket } from '@/hooks/useSocket';
import { useAuth } from '@/hooks/useAuth';
import { AlertCircle, Loader2 } from 'lucide-react';

function normalizeMessage(message) {
  if (!message) return message;
  return {
    ...message,
    sender_name:
      message.sender_name ||
      message.users?.full_name ||
      message.users?.university_email ||
      message.user_name ||
      'User',
  };
}

export default function ChatPanel({ roomId, onChatFileUploaded, embedded = false }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const { emit, on, off } = useSocket();
  const { user } = useAuth();

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const data = await getMessages(roomId);
        const nextMessages = (data.messages || data || []).map(normalizeMessage);
        setMessages(nextMessages);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchMessages();
  }, [roomId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    emit('chat:join', { roomId });

    const handleNewMessage = (msg) => {
      setMessages((prev) => [...prev, normalizeMessage(msg)]);
    };

    on('chat:message', handleNewMessage);

    return () => {
      off('chat:message', handleNewMessage);
      emit('chat:leave', { roomId });
    };
  }, [roomId, emit, on, off]);

  const handleSend = (content) => {
    setError('');
    emit('chat:message', { roomId, content });
  };

  const handleFileSelect = async (file, customName, customDesc) => {
    setUploading(true);
    setError('');
    try {
      // Upload file to server with category 'chat'
      const uploaded = await uploadFile(roomId, file, {
        description: customDesc || '',
        category: 'chat',
        file_name: customName || undefined,
      });

      // Build file message content as JSON
      const fileContent = JSON.stringify({
        file_id: uploaded.id,
        file_name: uploaded.file_name || customName || file.name,
        file_type: uploaded.file_type || file.type,
        file_size: uploaded.file_size || file.size,
        download_url: uploaded.download_url,
      });

      // Send as file message via socket
      emit('chat:message', { roomId, content: fileContent, message_type: 'file' });

      // Notify parent so Files tab updates
      onChatFileUploaded?.(uploaded);
    } catch (err) {
      console.error('File upload failed:', err);
      setError(err.message || 'Failed to upload this file.');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    const handleChatError = (payload) => {
      setError(payload?.error || 'Failed to send message.');
    };

    on('chat:error', handleChatError);
    return () => off('chat:error', handleChatError);
  }, [on, off]);

  const outerClass = embedded
    ? 'flex h-full min-h-0 flex-col overflow-hidden bg-white'
    : 'flex h-[min(56svh,32rem)] min-h-[19rem] sm:h-[600px] sm:min-h-[24rem] flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-xl shadow-blue-500/5';

  if (loading) {
    return (
      <div className={embedded ? 'flex h-full min-h-0 items-center justify-center bg-white' : 'flex h-[min(56svh,32rem)] min-h-[19rem] sm:h-[600px] sm:min-h-[24rem] items-center justify-center rounded-2xl border border-slate-200/60 bg-white shadow-xl shadow-blue-500/5'}>
        <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className={outerClass}>
      {/* Gradient header */}
      {!embedded && (
        <div className="flex shrink-0 items-center justify-between rounded-t-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-2.5 sm:px-5 sm:py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            </div>
            <span className="text-white font-bold text-sm tracking-wide">Chat</span>
          </div>
          <span className="text-white/70 text-xs font-medium bg-white/10 rounded-full px-3 py-1">
            {messages.length} message{messages.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Messages area */}
      <div className={`min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-gradient-to-b from-slate-50 to-white ${embedded ? 'px-3 py-2.5 sm:px-4 sm:py-4' : 'p-3 sm:p-5'}`}>
        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 shadow-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {messages.length === 0 && (
          <div className={`${embedded ? 'py-10' : 'py-16'} text-center`}>
            <div className={`mx-auto ${embedded ? 'mb-3 h-14 w-14 rounded-[18px]' : 'mb-4 h-20 w-20 rounded-2xl'} flex items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-100 shadow-lg shadow-blue-500/10`}>
              <svg xmlns="http://www.w3.org/2000/svg" className={`${embedded ? 'h-7 w-7' : 'h-10 w-10'} text-blue-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            </div>
            <p className={`${embedded ? 'text-sm' : 'text-base'} font-semibold text-slate-600`}>No messages yet</p>
            <p className={`${embedded ? 'mt-1 text-[12px]' : 'mt-1.5 text-sm'} text-slate-400`}>Start the conversation!</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} isOwn={msg.user_id === user?.id} />
        ))}
        <div ref={bottomRef} />
      </div>
      <ChatInput onSend={handleSend} onFileSelect={handleFileSelect} uploading={uploading} embedded={embedded} />
    </div>
  );
}
