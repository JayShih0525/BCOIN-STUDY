export type AvatarParams = Record<string, string | number | boolean | null | undefined>;

const VARIANT_KEYS = new Set(['glasses', 'eyes', 'mouth', 'eyebrows', 'hair', 'accessories']);

function normalizeVariantLike(v: string): string {
  const t = v.trim();

  // "1" -> "variant01"
  if (/^\d+$/.test(t)) return `variant${t.padStart(2, '0')}`;

  // "variant1" -> "variant01"
  const m = /^variant(\d)$/.exec(t);
  if (m) return `variant0${m[1]}`;

  return t;
}

function normalizeDicebearParams(params: AvatarParams): AvatarParams {
  const next: AvatarParams = {};

  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) continue;

      next[key] = VARIANT_KEYS.has(key) ? normalizeVariantLike(trimmed) : trimmed;
      continue;
    }

    next[key] = value; // number / boolean
  }

  // ✅ 關鍵：只要你有給 glasses，就強制 glassesProbability=100（確保一定顯示）
  if (typeof next.glasses === 'string' && next.glasses.length > 0) {
    next.glassesProbability = 100;
  }

  return next;
}

/**
 * getAvatarUrl
 * - cacheBust: true 會加 cb=timestamp，避免 RN/裝置快取導致「明明改了參數但圖不變」
 */
export function getAvatarUrl(
  seed: string,
  style: string = 'adventurer-neutral',
  params?: AvatarParams,
  cacheBust: boolean = false
): string {
  const pairs: string[] = [];

  pairs.push(`seed=${encodeURIComponent(seed || 'default')}`);
  pairs.push(`backgroundColor=transparent`);

  if (params) {
    const normalized = normalizeDicebearParams(params);
    for (const [key, value] of Object.entries(normalized)) {
      if (value === undefined || value === null) continue;
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }

  // ✅ 防快取：預覽/切換配件時務必打開
  if (cacheBust) {
    pairs.push(`cb=${Date.now()}`);
  }

  return `https://api.dicebear.com/9.x/${encodeURIComponent(style)}/png?${pairs.join('&')}`;
}