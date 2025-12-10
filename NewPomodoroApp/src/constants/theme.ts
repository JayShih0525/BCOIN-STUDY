/**
 * Theme Constants
 * 主題常數：顏色、尺寸等
 */

export const COLORS = {
    primary: '#81c3ccff',
    secondary: '#D4EEF0',
    white: '#FFFFFF',
    black: '#000',
    gray: '#666',
    shadow: '#000',
} as const;

export const SPACING = {
    xs: 8,
    sm: 10,
    md: 16,
    lg: 20,
    xl: 40,
} as const;

export const BORDER_RADIUS = {
    sm: 20,
    md: 30,
    lg: 40,
} as const;

export const FONT_SIZES = {
    xs: 12,
    sm: 16,
    md: 18,
    lg: 20,
    xl: 48,
    xxl: 72,
} as const;

export const FONT_WEIGHTS = {
    normal: '400',
    semibold: '600',
    bold: 'bold',
} as const;
