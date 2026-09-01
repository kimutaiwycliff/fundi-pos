import { useColorScheme } from 'react-native';

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
