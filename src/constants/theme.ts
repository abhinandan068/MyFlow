// Design system tokens for MyFlow
// All values match the locked visual design spec

export const Colors = {
  // Backgrounds
  background: '#101010',
  card: '#1C1C1E',
  inputBg: '#111113',

  // Accents
  primary: '#B5A0FF',
  primaryDim: '#7C6DC4',

  // Financial semantic colors
  income: '#4ADE80',
  expense: '#FB7185',
  warning: '#FBBF24',
  transfer: '#60A5FA',

  // Text
  textPrimary: '#F4F4F5',
  textSecondary: '#A1A1AA',
  textDisabled: '#52525B',

  // UI chrome
  border: '#303034',
  separator: '#27272A',
  overlay: 'rgba(0,0,0,0.6)',

  // Status
  success: '#4ADE80',
  error: '#FB7185',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  section: 40,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 28,
  display: 34,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const Shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;
