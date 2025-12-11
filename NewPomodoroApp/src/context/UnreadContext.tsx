// src/context/UnreadContext.tsx
import React, { createContext, useContext, useState } from 'react';

type UnreadState = {
  total: number;
  perRoom: Record<string, number>;
};

type UnreadContextValue = {
  unread: UnreadState;
  setUnreadState: React.Dispatch<React.SetStateAction<UnreadState>>;

  setRoomUnread: (roomId: string, count: number) => void;
  incrementRoomUnread: (roomId: string, delta?: number) => void;
  clearRoomUnread: (roomId: string) => void;
};

const UnreadContext = createContext<UnreadContextValue | null>(null);

export const UnreadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unread, setUnreadState] = useState<UnreadState>({ total: 0, perRoom: {} });

  const recomputeTotal = (perRoom: Record<string, number>) =>
    Object.values(perRoom).reduce((sum, v) => sum + v, 0);

  const setRoomUnread = (roomId: string, count: number) => {
    setUnreadState((prev) => {
      const perRoom = { ...prev.perRoom, [roomId]: Math.max(0, count) };
      if (perRoom[roomId] === 0) {
        delete perRoom[roomId];
      }
      return {
        perRoom,
        total: recomputeTotal(perRoom),
      };
    });
  };

  const incrementRoomUnread = (roomId: string, delta: number = 1) => {
    setUnreadState((prev) => {
      const current = prev.perRoom[roomId] ?? 0;
      const next = Math.max(0, current + delta);
      const perRoom = { ...prev.perRoom, [roomId]: next };
      if (next === 0) {
        delete perRoom[roomId];
      }
      return {
        perRoom,
        total: recomputeTotal(perRoom),
      };
    });
  };

  const clearRoomUnread = (roomId: string) => {
    setUnreadState((prev) => {
      const perRoom = { ...prev.perRoom };
      delete perRoom[roomId];
      return {
        perRoom,
        total: recomputeTotal(perRoom),
      };
    });
  };

  return (
    <UnreadContext.Provider
      value={{ unread, setUnreadState, setRoomUnread, incrementRoomUnread, clearRoomUnread }}
    >
      {children}
    </UnreadContext.Provider>
  );
};

export const useUnread = () => {
  const ctx = useContext(UnreadContext);
  if (!ctx) throw new Error('useUnread must be used within UnreadProvider');
  return ctx;
};