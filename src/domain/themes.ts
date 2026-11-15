export const LAYOUT_THEME_IDS = ['workbench', 'console', 'studio', 'focus'] as const;
export type LayoutTheme = (typeof LAYOUT_THEME_IDS)[number];
export function layoutTheme(value: unknown): LayoutTheme {
  return LAYOUT_THEME_IDS.includes(value as LayoutTheme) ? (value as LayoutTheme) : 'workbench';
}
