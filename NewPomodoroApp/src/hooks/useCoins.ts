// src/hooks/useCoins.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';

interface UseCoinsReturn {
  coins: number;
  addCoins: (amount: number) => void;
  removeCoins: (amount: number) => void;
  setCoins: (amount: number) => void;
  loading: boolean;
  refresh: () => Promise<void>;   // ⭐ 新增：手動重新讀取資料庫
}

export const useCoins = (userId?: string | null): UseCoinsReturn => {
  const [coins, setCoinsState] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  // ⭐ 把讀取資料庫抽成一個 function，外面也可以呼叫
  const fetchCoins = useCallback(async () => {
    if (!userId) {
      setCoinsState(0);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from('user_coins')
      .select('coins')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('載入 user_coins 失敗：', error.message);
      // 想的話也可以彈出提示
      // Alert.alert('載入金幣失敗', error.message);
    } else if (data) {
      setCoinsState(data.coins ?? 0);
    } else {
      // 還沒有資料，就先插入一筆 0
      const { error: insertError } = await supabase
        .from('user_coins')
        .insert({ user_id: userId, coins: 100 });

      if (insertError) {
        console.warn('初始化 user_coins 失敗：', insertError.message);
      } else {
        setCoinsState(0);
      }
    }

    setLoading(false);
  }, [userId]);

  // 初始化或 userId 變動時自動讀一次
  useEffect(() => {
    void fetchCoins();
  }, [fetchCoins]);

  // 寫回資料庫
  const persistCoins = useCallback(
    async (newCoins: number) => {
      if (!userId) return;

      const { error } = await supabase
        .from('user_coins')
        .upsert(
          { user_id: userId, coins: newCoins },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.warn('更新 user_coins 失敗：', error.message);
      }
    },
    [userId]
  );

  const addCoins = useCallback(
    (amount: number) => {
      if (amount <= 0) return;
      setCoinsState(prev => {
        const next = prev + amount;
        void persistCoins(next);
        return next;
      });
    },
    [persistCoins]
  );

  const removeCoins = useCallback(
    (amount: number) => {
      if (amount <= 0) return;
      setCoinsState(prev => {
        const next = Math.max(0, prev - amount);
        void persistCoins(next);
        return next;
      });
    },
    [persistCoins]
  );

  const setCoins = useCallback(
    (amount: number) => {
      const safe = Math.max(0, amount);
      setCoinsState(safe);
      void persistCoins(safe);
    },
    [persistCoins]
  );

  return {
    coins,
    addCoins,
    removeCoins,
    setCoins,
    loading,
    refresh: fetchCoins,   // ⭐ 對外暴露 refresh，裡面實作就是 fetchCoins
  };
};