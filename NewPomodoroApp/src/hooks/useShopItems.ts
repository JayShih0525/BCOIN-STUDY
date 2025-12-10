// src/hooks/useShopItems.ts
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ShopItem, mapRowToShopItem } from '../constants/shop';

export const useShopItems = () => {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from('shop_items')
        .select('*');

      if (error) {
        console.warn('載入 shop_items 發生錯誤', error);
        setItems([]);
      } else {
        setItems(data.map(mapRowToShopItem));
      }

      setLoading(false);
    };

    load();
  }, []);

  return { items, loading };
};