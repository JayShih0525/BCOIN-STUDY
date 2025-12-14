export type AvatarParams = Record<string, string | number | boolean | undefined>;

function padVariant(v: string) {
  // variant1 -> variant01
  const m = /^variant(\d)$/.exec(v);
  if (!m) return v;
  return `variant0${m[1]}`;
}

function normalizeDicebearParams(params: AvatarParams): AvatarParams {
  const next: AvatarParams = { ...params };

  // 1) 常見：variant1 -> variant01
  for (const k of ['glasses', 'eyes', 'mouth', 'eyebrows', 'hair', 'accessories']) {
    const val = next[k];
    if (typeof val === 'string') {
      next[k] = padVariant(val);
    }
  }

  // 2) 如果有指定 glasses，就強制出現
  if (typeof next.glasses === 'string' && next.glasses.length > 0) {
    if (next.glassesProbability === undefined) next.glassesProbability = 100;
  }

  return next;
}

export function getAvatarUrl(
  seed: string,
  style: string = 'adventurer-neutral',
  params?: AvatarParams
): string {
  const pairs: string[] = [];

  pairs.push(`seed=${encodeURIComponent(seed || 'default')}`);
  pairs.push(`backgroundColor=transparent`);

  const normalized = params ? normalizeDicebearParams(params) : undefined;

  if (normalized) {
    Object.entries(normalized).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    });
  }

  return `https://api.dicebear.com/9.x/${encodeURIComponent(style)}/png?${pairs.join('&')}`;
}