// src/constants/shop.ts

// ✅ 支援 filter + DiceBear avatar 類商品
export type ShopItemType =
  | 'filter'
  | 'eyes'
  | 'mouth'
  | 'hair'
  | 'accessory'
  | 'background'
  | 'style'
  | 'eyebrows'
  | 'glasses'
  | 'skinColor'
  | 'hairColor';

// ⚠️ 這是「前端用的型別」（camelCase）
// DB 裡是 filter_id / icon_url / avatar_params（snake_case）
export interface ShopItem {
  id: string;
  name: string;
  price: number;
  type: ShopItemType;

  // filter 商品用
  filterId?: string;

  // avatar 商品用（DiceBear query params）
  avatarParams?: Record<string, any> | null;

  // UI 顯示用
  iconUrl?: string | null;
  description?: string | null;
}

/**
 * 把 Supabase row 轉成前端用的 ShopItem
 */
export const mapRowToShopItem = (row: any): ShopItem => ({
  id: String(row.id),
  name: String(row.name),
  price: Number(row.price ?? 0),
  type: row.type as ShopItemType,

  filterId: row.filter_id ?? undefined,
  avatarParams: row.avatar_params ?? null, // ✅ 關鍵

  iconUrl: row.icon_url ?? null,
  description: row.description ?? null,
});