import { useColorScheme } from 'react-native';
import { DefaultTheme, DarkTheme, type Theme } from '@react-navigation/native';

// NativeWind's className system can't reach TextInput's native
// placeholderTextColor prop the way it can `text-*` classes on <Text> - it
// needs a real color string, not a class. Values match global.css's
// --color-muted-foreground exactly, light and dark, so every placeholder
// in the app tracks the same token dark mode already uses everywhere else.
const MUTED_FOREGROUND_LIGHT = '#6e605a';
const MUTED_FOREGROUND_DARK = '#a99b94';

export function useMutedPlaceholderColor(): string {
  const scheme = useColorScheme();
  return scheme === 'dark' ? MUTED_FOREGROUND_DARK : MUTED_FOREGROUND_LIGHT;
}

// React Navigation ships its own light-only default theme for chrome it
// renders itself (the bottom tab bar's background/border, in this app's
// case) - without this it stays white/light-gray regardless of the OS
// scheme, clashing with every NativeWind-themed screen around it. Same
// hex values as global.css's light/dark tokens, for the same reason
// useMutedPlaceholderColor needs real color strings above.
const APP_LIGHT_THEME: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#df5102',
    background: '#ffffff',
    card: '#ffffff',
    text: '#16100e',
    border: '#e7dbd5',
    notification: '#e7000b',
  },
};

const APP_DARK_THEME: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#f3680f',
    background: '#110c0a',
    card: '#1e1613',
    text: '#f8f0ec',
    border: '#3a2d26',
    notification: '#ff6467',
  },
};

export function useNavigationTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? APP_DARK_THEME : APP_LIGHT_THEME;
}
