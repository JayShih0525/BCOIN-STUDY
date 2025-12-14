// src/hooks/useShopItems.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type ShopItemRow = {
  id: string;
  name: string;
  price: number;
  type: string;
  icon_url?: string | null;
  avatar_params?: Record<string, any> | null;
  description?: string | null;
};

export const useShopItems = () => {
  const [items, setItems] = useState<ShopItemRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('shop_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('載入 shop_items 發生錯誤', error);
      setItems([]);
    } else {
      setItems((data ?? []) as ShopItemRow[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, refresh: load };
};