import type { GlobalThemeOverrides } from 'naive-ui';

export const VISUAL_THEME_IDS = ['modern', 'metro', 'material', 'cupertino'] as const;
export type VisualTheme = (typeof VISUAL_THEME_IDS)[number];
export function visualTheme(value: unknown): VisualTheme {
  return VISUAL_THEME_IDS.includes(value as VisualTheme) ? (value as VisualTheme) : 'modern';
}
interface Palette {
  surface: string;
  canvas: string;
  subtle: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  hover: string;
  pressed: string;
  selected: string;
  header: string;
  table: string;
  primaryText: string;
  brand: string;
}
const palettes: Record<VisualTheme, { light: Palette; dark: Palette }> = {
  modern: {
    light: {
      surface: '#ffffff',
      canvas: '#f5f7f9',
      subtle: '#edf1f4',
      border: '#e3e8ed',
      text: '#263540',
      muted: '#5f6d78',
      accent: '#117c6e',
      hover: '#0d6c60',
      pressed: '#09594f',
      selected: '#edf8f5',
      header: '#ffffff',
      table: '#f4f6f8',
      primaryText: '#ffffff',
      brand: '#117c6e',
    },
    dark: {
      surface: '#1b2027',
      canvas: '#14181e',
      subtle: '#252d36',
      border: '#303944',
      text: '#dce4ea',
      muted: '#8f9ba8',
      accent: '#48d6bd',
      hover: '#70e4cf',
      pressed: '#25b8a0',
      selected: '#193b37',
      header: '#1b2027',
      table: '#252d36',
      primaryText: '#102620',
      brand: '#48d6bd',
    },
  },
  metro: {
    light: {
      surface: '#ffffff',
      canvas: '#f5f1f2',
      subtle: '#f5e8eb',
      border: '#d7c9cc',
      text: '#342a2d',
      muted: '#75616a',
      accent: '#b72f43',
      hover: '#9e2035',
      pressed: '#85162b',
      selected: '#f8d9de',
      header: '#fbf0f2',
      table: '#f2dfe3',
      primaryText: '#ffffff',
      brand: '#b72f43',
    },
    dark: {
      surface: '#261f24',
      canvas: '#1a1519',
      subtle: '#382b33',
      border: '#57404a',
      text: '#f4e6eb',
      muted: '#c5aab6',
      accent: '#f18b98',
      hover: '#ffadb5',
      pressed: '#d66f80',
      selected: '#512b34',
      header: '#30222a',
      table: '#402b34',
      primaryText: '#291418',
      brand: '#f18b98',
    },
  },
  material: {
    light: {
      surface: '#ffffff',
      canvas: '#f0f1f8',
      subtle: '#eef0fa',
      border: '#dce0ef',
      text: '#292f48',
      muted: '#5e6782',
      accent: '#4d5ac7',
      hover: '#3e4ab1',
      pressed: '#303c97',
      selected: '#e7eaff',
      header: '#ffffff',
      table: '#eef0fa',
      primaryText: '#ffffff',
      brand: '#4d5ac7',
    },
    dark: {
      surface: '#222536',
      canvas: '#161925',
      subtle: '#2e334a',
      border: '#444b67',
      text: '#e5e8f6',
      muted: '#b0b7cd',
      accent: '#adb5ff',
      hover: '#cbd0ff',
      pressed: '#8995eb',
      selected: '#383f6a',
      header: '#262a3e',
      table: '#30364e',
      primaryText: '#1d2346',
      brand: '#adb5ff',
    },
  },
  cupertino: {
    light: {
      surface: '#ffffff',
      canvas: '#f0f1f4',
      subtle: '#f0f1f4',
      border: '#d1d6dd',
      text: '#232730',
      muted: '#636d7b',
      accent: '#0068c0',
      hover: '#0057a6',
      pressed: '#00468c',
      selected: '#e0edfc',
      header: '#f6f7f9',
      table: '#e9edf3',
      primaryText: '#ffffff',
      brand: '#0068c0',
    },
    dark: {
      surface: '#24272d',
      canvas: '#191b20',
      subtle: '#31353e',
      border: '#4a505c',
      text: '#eceef5',
      muted: '#b0b8c7',
      accent: '#78b7ff',
      hover: '#a2ceff',
      pressed: '#5699e5',
      selected: '#253f60',
      header: '#2d3038',
      table: '#353a44',
      primaryText: '#12243a',
      brand: '#78b7ff',
    },
  },
};
export function visualProfile(id: VisualTheme, dark: boolean) {
  const palette = palettes[id][dark ? 'dark' : 'light'];
  const radius = { modern: '6px', metro: '0px', material: '10px', cupertino: '8px' }[id];
  const buttonRadius = id === 'material' ? '18px' : radius;
  const shadow =
    id === 'metro'
      ? 'none'
      : id === 'material'
        ? '0 12px 36px #00000024, 0 2px 8px #00000014'
        : id === 'cupertino'
          ? '0 10px 30px #00000020, 0 0 0 1px #0000000a'
          : '0 6px 24px #00000020';
  return { id, dark, palette, radius, buttonRadius, shadow };
}
export function visualVariables(profile: ReturnType<typeof visualProfile>): Record<string, string> {
  const p = profile.palette;
  return {
    '--surface': p.surface,
    '--canvas': p.canvas,
    '--subtle': p.subtle,
    '--border': p.border,
    '--text': p.text,
    '--muted': p.muted,
    '--accent': p.accent,
    '--selected': p.selected,
    '--header-surface': p.header,
    '--table-head': p.table,
    '--brand': p.brand,
    '--brand-glow': profile.id === 'modern' ? '#d6fff4' : '#ffffff',
    '--primary-text': p.primaryText,
    '--skin-radius': profile.radius,
    '--control-radius': profile.buttonRadius,
    '--skin-shadow': profile.shadow,
  };
}
export function formControlOverrides(
  profile: ReturnType<typeof visualProfile>,
): GlobalThemeOverrides {
  const p = profile.palette;
  const input = {
    borderRadius: profile.radius,
    color: p.subtle,
    colorHover: p.subtle,
    colorFocus: p.subtle,
    colorDisabled: p.canvas,
    textColor: p.text,
    textColorDisabled: p.muted,
    placeholderColor: p.muted,
    placeholderColorDisabled: p.muted,
    suffixTextColor: p.muted,
    border: `1px solid ${p.muted}`,
    borderDisabled: `1px solid ${p.muted}`,
    borderHover: `1px solid ${p.accent}`,
    borderFocus: `1px solid ${p.accent}`,
    boxShadowFocus: `0 0 0 2px ${p.selected}`,
  };
  return {
    Input: input,
    InputNumber: { peers: { Input: input }, iconColorDisabled: p.muted },
    AutoComplete: { peers: { Input: input } },
    TimePicker: { peers: { Input: input } },
    Select: {
      peers: {
        InternalSelection: {
          color: p.subtle,
          colorActive: p.subtle,
          colorDisabled: p.canvas,
          textColor: p.text,
          textColorDisabled: p.muted,
          placeholderColor: p.muted,
          placeholderColorDisabled: p.muted,
          border: `1px solid ${p.muted}`,
          borderHover: `1px solid ${p.accent}`,
          borderFocus: `1px solid ${p.accent}`,
          borderActive: `1px solid ${p.accent}`,
          boxShadowFocus: `0 0 0 2px ${p.selected}`,
          boxShadowActive: `0 0 0 2px ${p.selected}`,
          arrowColor: p.muted,
          arrowColorDisabled: p.muted,
        },
      },
    },
    ColorPicker: { border: `1px solid ${p.muted}`, peers: { Input: input } },
  };
}
export function visualOverrides(profile: ReturnType<typeof visualProfile>): GlobalThemeOverrides {
  const p = profile.palette;
  const modern = profile.id === 'modern';
  return {
    common: {
      primaryColor: p.accent,
      primaryColorHover: p.hover,
      primaryColorPressed: p.pressed,
      borderRadius: profile.radius,
      borderRadiusSmall: profile.radius,
      fontSize: '13px',
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
      textColor1: p.text,
      textColor2: p.text,
      textColor3: p.muted,
      borderColor: p.border,
      dividerColor: p.border,
      hoverColor: p.subtle,
      cardColor: p.surface,
      modalColor: p.surface,
      popoverColor: p.surface,
      inputColor: profile.id === 'material' ? p.subtle : p.surface,
      bodyColor: p.canvas,
      placeholderColor: p.muted,
    },
    Button: {
      borderRadiusTiny: profile.buttonRadius,
      borderRadiusSmall: profile.buttonRadius,
      borderRadiusMedium: profile.buttonRadius,
      borderRadiusLarge: profile.buttonRadius,
      textColorPrimary: p.primaryText,
      textColorHoverPrimary: p.primaryText,
      textColorPressedPrimary: p.primaryText,
      textColorFocusPrimary: p.primaryText,
      colorSecondary: p.subtle,
      colorSecondaryHover: p.selected,
    },
    Input: {
      borderRadius: profile.radius,
      color: profile.id === 'material' ? p.subtle : p.surface,
      colorFocus: p.surface,
      colorHover: profile.id === 'material' ? p.subtle : p.surface,
    },
    ...(profile.dark ? formControlOverrides(profile) : {}),
    Card: {
      borderRadius: profile.radius,
      boxShadow: profile.shadow,
      titleFontWeight: modern ? '500' : '650',
    },
    Checkbox: { borderRadius: profile.id === 'metro' ? '0px' : '3px' },
    Dropdown: {
      borderRadius: profile.radius,
      optionColorHover: p.subtle,
      optionColorActive: p.selected,
      optionColorActiveHover: p.selected,
    },
    Popover: { borderRadius: profile.radius, boxShadow: profile.shadow },
    Tabs: { tabTextColorActiveLine: p.accent, barColor: p.accent },
    DataTable: {
      tdPaddingSmall: '5px 10px',
      thPaddingSmall: '8px 10px',
      borderRadius: profile.radius,
      thColor: p.table,
      tdColor: p.surface,
      tdColorHover: p.subtle,
      borderColor: p.border,
      thTextColor: p.text,
      tdTextColor: p.text,
      thFontWeight: profile.id === 'metro' ? '650' : '500',
    },
  };
}
