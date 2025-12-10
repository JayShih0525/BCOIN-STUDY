// src/constants/shop.ts

// 目前先只有濾鏡類型
export type ShopItemType = 'filter';

// ⚠️ 注意：這是「前端用的型別」（camelCase）
// DB 裡是 filter_id / icon_url（snake_case）
export interface ShopItem {
  id: string;
  name: string;
  price: number;
  type: ShopItemType;
  filterId?: string;           // 對應 DB 的 filter_id
  iconUrl?: string | null;     // 對應 DB 的 icon_url（URL）
  description?: string | null; // 對應 DB 的 description
}

/**
 * 把 Supabase 撈回來的 row 轉成前端用的 ShopItem
 * （這樣前端就不用到處寫 row.filter_id 了）
 */
export const mapRowToShopItem = (row: any): ShopItem => ({
  id: row.id,
  name: row.name,
  price: row.price,
  type: row.type as ShopItemType,
  filterId: row.filter_id ?? undefined,
  iconUrl: row.icon_url ?? null,
  description: row.description ?? null,
});