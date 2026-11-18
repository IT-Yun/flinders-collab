import { useEffect, useCallback, useRef } from 'react';
import { socket } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';

export function useSocket() {
  const session = useAuthStore((s) => s.session);
  const listenersRef = useRef([]);

  useEffect(() => {
    if (session?.access_token) {
      socket.auth = { token: session.access_token };
      if (!socket.connected) {
        socket.connect();
      }
    } else {
      socket.disconnect();
    }

    return undefined;
  }, [session?.access_token]);

  const emit = useCallback((event, data) => {
    socket.emit(event, data);
  }, []);

  const on = useCallback((event, handler) => {
    socket.on(event, handler);
    listenersRef.current.push({ event, handler });
  }, []);

  const off = useCallback((event, handler) => {
    socket.off(event, handler);
    listenersRef.current = listenersRef.current.filter(
      (l) => !(l.event === event && l.handler === handler)
    );
  }, []);

  useEffect(() => {
    return () => {
      listenersRef.current.forEach(({ event, handler }) => {
        socket.off(event, handler);
      });
      listenersRef.current = [];
    };
  }, []);

  return { socket, emit, on, off, connected: socket.connected };
}
