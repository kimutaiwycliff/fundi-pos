import { useEffect } from 'react';
import { View, Text, Pressable, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';
import { MAX_PIN_LENGTH } from '../lib/pin';

// Explicit 3-per-row grid (not width-dependent flex-wrap, which could show
// 4+ across on a wider phone) - matches the phone-dialer keypad layout
// users already know.
const ROWS: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'del'],
];

// Standard modern mobile PIN entry (dots that pop in one at a time as you
// type - not a fixed pre-filled grid, since till PINs are 4-6 digits, not
// one fixed length, so a fixed dot count would misrepresent how many are
// actually needed - big circular keypad with per-key press feedback,
// haptics, auto-submit at `length` digits, shake on a wrong-PIN error).
// Shared by both the phone+PIN login form and the offline PIN-resume screen
// in App.tsx, since they're otherwise the same interaction repeated twice.
export function PinPad({
  value,
  onChange,
  onComplete,
  length = MAX_PIN_LENGTH,
  error,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  length?: number;
  error?: string | null;
  disabled?: boolean;
}) {
  const scheme = useColorScheme();
  const iconColor = scheme === 'dark' ? '#f8f0ec' : '#16100e';
  const shake = useSharedValue(0);

  useEffect(() => {
    if (!error) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    shake.value = withSequence(
      withTiming(-10, { duration: 40 }),
      withTiming(10, { duration: 80 }),
      withTiming(-8, { duration: 80 }),
      withTiming(8, { duration: 80 }),
      withTiming(0, { duration: 40 }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  function press(key: string) {
    if (disabled) return;
    if (key === '') return;
    if (key === 'del') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    const next = value + key;
    onChange(next);
    if (next.length === length) {
      onComplete(next);
    }
  }

  return (
    <View className="gap-8">
      <Animated.View style={shakeStyle} className="min-h-4 flex-row justify-center gap-4">
        {Array.from({ length: value.length }).map((_, i) => (
          <Animated.View
            key={i}
            entering={ZoomIn.duration(120)}
            className={`h-4 w-4 rounded-full border-2 ${error ? 'border-destructive bg-destructive' : 'border-primary bg-primary'}`}
          />
        ))}
      </Animated.View>

      <View className="gap-4">
        {ROWS.map((row, rowIndex) => (
          <View key={rowIndex} className="flex-row justify-center gap-4">
            {row.map((key, i) =>
              key === '' ? (
                <View key={i} className="h-[72px] w-[72px]" />
              ) : (
                <PinKey
                  key={i}
                  disabled={disabled}
                  onPress={() => press(key)}
                  content={key === 'del' ? <Ionicons name="backspace-outline" size={26} color={iconColor} /> : <Text className="text-2xl font-semibold text-foreground">{key}</Text>}
                />
              ),
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function PinKey({ content, onPress, disabled }: { content: React.ReactNode; onPress: () => void; disabled?: boolean }) {
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={pressStyle}>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          // eslint-disable-next-line react-hooks/immutability -- Reanimated's .value setter is the intended mutation API
          scale.value = withTiming(0.9, { duration: 80 });
        }}
        onPressOut={() => {
          // eslint-disable-next-line react-hooks/immutability -- Reanimated's .value setter is the intended mutation API
          scale.value = withTiming(1, { duration: 120 });
        }}
        android_ripple={{ color: '#ffffff30', radius: 36, borderless: true }}
        className={`h-[72px] w-[72px] items-center justify-center rounded-full border border-border bg-card ${disabled ? 'opacity-50' : ''}`}
      >
        {content}
      </Pressable>
    </Animated.View>
  );
}
