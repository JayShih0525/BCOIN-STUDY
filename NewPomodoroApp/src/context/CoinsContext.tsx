// src/context/CoinsContext.tsx

import React, { createContext, useContext, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useCoins } from '../hooks/useCoins';

// 直接用 useCoins 的回傳型別，省得自己再定義
type CoinsContextType = ReturnType<typeof useCoins>;

const CoinsContext = createContext<CoinsContextType | undefined>(undefined);

export const CoinsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  // ✅ 全 App 只在這裡呼叫一次 useCoins
  const coinsHook = useCoins(user?.id ?? undefined);

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