// src/utils/avatar.ts

/**
 * 根據用戶 ID 產生 DiceBear 頭像網址
 *
 * 我們使用 'adventurer-neutral' 風格，這是一種可愛、中性的人物風格。
 * 你可以在這裡挑選其他風格：https://dicebear.com/styles
 *
 * @param userId 用戶的唯一 ID (或是任何唯一字串)，用來當作種子(seed)
 * @returns 完整的圖片 URL 字串
 */
export const getAvatarUrl = (userId: string): string => {
  // 1. 確保 userId 是 URL 安全的
  const encodedSeed = encodeURIComponent(userId);

  // 2. 選擇風格 (這里選了 adventurer-neutral)
  // 使用 PNG 格式，對 React Native 的 <Image> 元件支援度最好
  const style = 'adventurer-neutral';

  // 3. 回傳完整網址
  // backgroundColor=transparent: 讓背景透明
  return `https://api.dicebear.com/9.x/adventurer-neutral/png?seed=${userId}&backgroundColor=transparent`;
};