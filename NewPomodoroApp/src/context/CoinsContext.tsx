// src/context/CoinsContext.tsx

import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useCoins } from '../hooks/useCoins';
import { chatClient } from '../utils/chatClient';

// 直接用 useCoins 的回傳型別
type CoinsContextType = ReturnType<typeof useCoins>;

const CoinsContext = createContext<CoinsContextType | undefined>(undefined);

export const CoinsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  // ✅ 全 App 只在這裡呼叫一次 useCoins
  // 假設 useCoins 回傳像這樣子: { coins, loading, refreshCoins, ... }
  const coinsHook = useCoins(user?.id ?? undefined);

  // ============================================================
  // ★ 新增：全域監聽 Socket 轉帳訊息
  // ============================================================
  useEffect(() => {
    if (!user) return;

    const handleGlobalMessage = (msg: any) => {
      // 1. 基本檢查
      if (!msg || typeof msg !== 'object') return;

      // 2. 判斷是否為「轉帳」訊息
      // 條件：類型是 MESSAGE + 內容包含關鍵字
      const isTransfer = 
         msg.type === 'MESSAGE' && 
         msg.content && 
         msg.content.includes('💸 Sent') && 
         msg.content.includes('coins');

      // 3. 判斷是否為「別人傳給我的」 (我是接收者)
      // socket 廣播會傳給房間所有人，senderId 不等於自己，代表是別人轉錢給我
      if (isTransfer && msg.senderId !== user.id) {
        console.log('[CoinsContext] 收到轉帳通知，全域更新餘額！');
        
        // ★ 呼叫 hook 裡的刷新函式
        // 請確認你的 useCoins hook 裡回傳的名稱是 refresh 還是 refreshCoins
        // 如果你的 hook 回傳的是 { refresh: ... }，請改成 coinsHook.refresh()
        if (coinsHook.refresh) {
            coinsHook.refresh();
        } else if ((coinsHook as any).refresh) {
            (coinsHook as any).refresh();
        }
      }
    };

    // 註冊監聽
    chatClient.addChatListener(handleGlobalMessage);

    // 清除監聽 (Component 卸載或 User 登出時)
    return () => {
      chatClient.removeChatListener(handleGlobalMessage);
    };
  }, [user, coinsHook]); 
  // ============================================================

  return (
    <CoinsContext.Provider value={coinsHook}>
      {children}
    </CoinsContext.Provider>
  );
};

export const useCoinsContext = () => {
  const ctx = useContext(CoinsContext);
  if (!ctx) {
    throw new Error('useCoinsContext 必須在 CoinsProvider 裡面使用');
  }
  return ctx;
};