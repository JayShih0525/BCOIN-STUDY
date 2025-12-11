// src/hooks/useCoins.ts
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

interface UseCoinsReturn {
  coins: number;
  addCoins: (amount: number) => void;
  removeCoins: (amount: number) => void;
  setCoins: (amount: number) => void;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * useCoins
 * - 先用 AsyncStorage 當本地快取
 * - 再跟 Supabase 的 user_coins 做同步
 * - Supabase 只當「備份 + 其他裝置同步」，不會亂蓋掉本地
 */
export const useCoins = (userId?: string | null): UseCoinsReturn => {
  const [coins, setCoinsState] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  // 每個 user 用不同 local key
  const storageKey = userId ? `user_coins_${userId}` : 'user_coins_guest';

  /** ⭐ 優先從本地載入，再跟 Supabase 合併 */
  const loadInitialCoins = useCallback(async () => {
    if (!userId) {
      // 沒登入就只用本地 guest 值
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw != null) {
          const local = Number(raw);
          if (!Number.isNaN(local)) setCoinsState(local);
        }
      } catch (e) {
        console.warn('讀取 guest coins 失敗：', e);
      }
      return;
    }

    setLoading(true);
    try {
      // 1️⃣ 先讀本地
      let localCoins = 0;
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw != null) {
          const parsed = Number(raw);
          if (!Number.isNaN(parsed)) localCoins = parsed;
        }
      } catch (e) {
        console.warn('讀取 AsyncStorage 失敗：', e);
      }

      setCoinsState(localCoins);

      // 2️⃣ 再從 Supabase 拿遠端值
      const { data, error } = await supabase
        .from('user_coins')
        .select('coins')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.warn('載入 user_coins 失敗（使用本地值）：', error.message);
        return;
      }

      if (!data) {
        // 雲端沒有資料 → 以本地為主，新建一筆
        const { error: insertError } = await supabase
          .from('user_coins')
          .insert({ user_id: userId, coins: localCoins });

        if (insertError) {
          console.warn('初始化 user_coins 失敗：', insertError.message);
        }
        return;
      }

      const remoteCoins = Number(data.coins ?? 0);

      // 3️⃣ 合併策略：取「較大的」那個，避免誤蓋掉使用者已經拿到的 coin
      const finalCoins = Math.max(localCoins, remoteCoins);

      setCoinsState(finalCoins);
      await AsyncStorage.setItem(storageKey, String(finalCoins));

      // 如果本地比較大 → 回寫到 Supabase
      if (finalCoins !== remoteCoins) {
        const { error: upsertError } = await supabase
          .from('user_coins')
          .upsert({ user_id: userId, coins: finalCoins }, { onConflict: 'user_id' });

        if (upsertError) {
          console.warn('同步 user_coins 失敗：', upsertError.message);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [userId, storageKey]);

  /** ⭐ 手動重新從 Supabase 抓一次（例如進 Guild / Shop 時） */
  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_coins')
        .select('coins')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.warn('refresh user_coins 失敗：', error.message);
        return;
      }

      if (!data) return;

      const remoteCoins = Number(data.coins ?? 0);
      setCoinsState(remoteCoins);
      await AsyncStorage.setItem(storageKey, String(remoteCoins));
    } finally {
      setLoading(false);
    }
  }, [userId, storageKey]);

  /** 初始化載入 */
  useEffect(() => {
    void loadInitialCoins();
  }, [loadInitialCoins]);

  /** 共用的更新：先改本地 + AsyncStorage，再試著同步 Supabase（失敗也不影響 UI） */
  const updateCoins = useCallback(
    async (next: number) => {
      const safe = Math.max(0, Math.floor(next));

      setCoinsState(safe);
      try {
        await AsyncStorage.setItem(storageKey, String(safe));
      } catch (e) {
        console.warn('寫入 AsyncStorage 失敗：', e);
      }

      if (!userId) return;

      // 背景同步到 Supabase（不要影響 UI）
      const { error } = await supabase
        .from('user_coins')
        .upsert({ user_id: userId, coins: safe }, { onConflict: 'user_id' });

      if (error) {
        console.warn('更新 user_coins 失敗（暫時先用本地值）：', error.message);
      }
    },
    [storageKey, userId]
  );

  const addCoins = useCallback(
    (amount: number) => {
      if (amount <= 0) return;
      setCoinsState(prev => {
        const next = prev + amount;
        void updateCoins(next);
        return next;
      });
    },
    [updateCoins]
  );

  const removeCoins = useCallback(
    (amount: number) => {
      if (amount <= 0) return;
      setCoinsState(prev => {
        const next = Math.max(0, prev - amount);
        void updateCoins(next);
        return next;
      });
    },
    [updateCoins]
  );

  const setCoins = useCallback(
    (amount: number) => {
      void updateCoins(amount);
    },
    [updateCoins]
  );

  return {
    coins,
    addCoins,
    removeCoins,
    setCoins,
    loading,
    refresh,
  };
};