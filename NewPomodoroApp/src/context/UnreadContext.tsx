// src/context/UnreadContext.tsx

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Vibration } from 'react-native'; // 1. 引入震動 API
import { useAuth } from './AuthContext';    // 2. 引入 Auth 取得 user.id
import { chatClient } from '../utils/chatClient'; // 3. 引入 Socket 監聽

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
  const { user } = useAuth(); // 取得當前使用者
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

  // ============================================================
  // ★ 新增：全域訊息震動監聽
  // ============================================================
  useEffect(() => {
    if (!user) return;

    const handleMessageVibration = (msg: any) => {
      if (!msg || typeof msg !== 'object') return;

      // 1. 判斷是否為新訊息
      if (msg.type === 'MESSAGE') {
        
        // 2. 判斷發送者不是我自己 (別人傳給我才震動)
        if (msg.senderId !== user.id) {
          console.log('[UnreadContext] 收到新訊息，震動通知！');
          
          // 3. 觸發震動
          // Android: 預設震動 400ms
          // iOS: 觸發系統預設震動
          Vibration.vibrate(); 
        }
      }
    };

    // 註冊監聽
    chatClient.addChatListener(handleMessageVibration);

    // 移除監聽
    return () => {
      chatClient.removeChatListener(handleMessageVibration);
    };
  }, [user]);
  // ============================================================

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