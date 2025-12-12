// src/context/UnreadContext.tsx

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Vibration } from 'react-native';
import { useAuth } from './AuthContext';
import { chatClient } from '../utils/chatClient';
import { supabase } from '../lib/supabase';

type UnreadState = {
  total: number;
  perRoom: Record<string, number>;
};

type UnreadContextValue = {
  unread: UnreadState;
  setActiveRoomId: (roomId: string | null) => void;
  setRoomUnread: (roomId: string, count: number) => void;
  incrementRoomUnread: (roomId: string, delta?: number) => void;
  clearRoomUnread: (roomId: string) => void;
  refreshUnreadCounts: () => Promise<void>;
};

const UnreadContext = createContext<UnreadContextValue | null>(null);

// 把這個純函式移到 Component 外面，避免重複建立
const recomputeTotal = (perRoom: Record<string, number>) =>
  Object.values(perRoom).reduce((sum, v) => sum + v, 0);

export const UnreadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [unread, setUnreadState] = useState<UnreadState>({ total: 0, perRoom: {} });
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  // 1. 抓取初始未讀
  const fetchUnreadCounts = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc('get_my_unread_counts', {
        p_user_id: user.id,
      });

      if (error) {
        console.error('Fetch unread error:', error);
        return;
      }

      const newPerRoom: Record<string, number> = {};
      (data as any[]).forEach((row) => {
        if (row.unread_count > 0) {
          newPerRoom[row.room_id] = row.unread_count;
        }
      });

      setUnreadState({
        perRoom: newPerRoom,
        total: recomputeTotal(newPerRoom),
      });
    } catch (e) {
      console.error(e);
    }
  }, [user]);

  useEffect(() => {
    fetchUnreadCounts();
  }, [fetchUnreadCounts]);

  // --- Helper Functions (使用 useCallback 解決無限迴圈) ---

  const setRoomUnread = useCallback((roomId: string, count: number) => {
    setUnreadState((prev) => {
      // 這裡需要依賴 activeRoomId，但因為它是在 setState callback 內部判斷，
      // 其實可以透過 Ref 來解，但為了簡單，我們這裡允許它變動。
      // 關鍵是下面的 clearRoomUnread 必須穩定。
      if (roomId === activeRoomId) count = 0; 

      const perRoom = { ...prev.perRoom, [roomId]: Math.max(0, count) };
      if (perRoom[roomId] === 0) delete perRoom[roomId];
      return { perRoom, total: recomputeTotal(perRoom) };
    });
  }, [activeRoomId]);

  const incrementRoomUnread = useCallback((roomId: string, delta: number = 1) => {
    // 如果使用者正在這個房間，直接忽略
    if (roomId === activeRoomId) return;

    setUnreadState((prev) => {
      const current = prev.perRoom[roomId] ?? 0;
      const next = Math.max(0, current + delta);
      const perRoom = { ...prev.perRoom, [roomId]: next };
      if (next === 0) delete perRoom[roomId];
      return { perRoom, total: recomputeTotal(perRoom) };
    });
  }, [activeRoomId]);

  // ★★★ 關鍵修復：這個函式現在是穩定的 (Dependency 是空陣列) ★★★
  // 這會防止 ChatScreen 的 useEffect 因為這個函式改變而無限重跑
  const clearRoomUnread = useCallback((roomId: string) => {
    setUnreadState((prev) => {
      const perRoom = { ...prev.perRoom };
      delete perRoom[roomId];
      return { perRoom, total: recomputeTotal(perRoom) };
    });
  }, []);

  // --- 全域監聽 ---
  useEffect(() => {
    if (!user) return;

    const handleNewMessage = (msg: any) => {
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'MESSAGE' && msg.senderId !== user.id) {
        if (msg.roomId === activeRoomId) {
            return; // 當前房間，不震動
        }
        
        console.log('[Unread] 收到背景訊息，震動通知！');
        Vibration.vibrate(); 
        if (msg.roomId) {
          // 這裡我們直接呼叫 setUnreadState 的邏輯，或者使用 ref 版本的 increment
          // 但因為依賴了 incrementRoomUnread，useEffect 會在 activeRoomId 改變時重綁，這是正常的
          incrementRoomUnread(msg.roomId);
        }
      }
    };

    chatClient.addChatListener(handleNewMessage);
    return () => chatClient.removeChatListener(handleNewMessage);
  }, [user, activeRoomId, incrementRoomUnread]);

  return (
    <UnreadContext.Provider
      value={{ 
        unread, 
        setActiveRoomId, 
        setRoomUnread, 
        incrementRoomUnread, 
        clearRoomUnread,
        refreshUnreadCounts: fetchUnreadCounts
      }}
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