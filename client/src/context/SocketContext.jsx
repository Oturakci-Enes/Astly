import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const socketRef = useRef(null);

  useEffect(() => {
    if (!token || !user) {
      // Disconnect if logged out
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setOnlineUsers(new Set());
      return;
    }

    const socket = io(window.location.origin.replace(/:\d+$/, ':3002'), {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('online-users-list', ({ users }) => {
      setOnlineUsers(new Set(users));
    });

    socket.on('user-online', ({ userId }) => {
      setOnlineUsers(prev => new Set([...prev, userId]));
    });

    socket.on('user-offline', ({ userId }) => {
      setOnlineUsers(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user?.id]);

  const isOnline = (userId) => onlineUsers.has(userId);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, onlineUsers, isOnline }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
