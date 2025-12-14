export type AvatarParams = Record<string, string | number | boolean | undefined>;

export function getAvatarUrl(
  seed: string,
  style: string = 'adventurer-neutral',
  params?: AvatarParams
): string {
  const pairs: string[] = [];

  pairs.push(`seed=${encodeURIComponent(seed)}`);
  pairs.push(`backgroundColor=transparent`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      pairs.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
      );
    });
  }

  return `https://api.dicebear.com/9.x/${style}/png?${pairs.join('&')}`;
}