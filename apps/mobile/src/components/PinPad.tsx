import { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

// Standard modern mobile PIN entry (dot progress + numeric keypad,
// haptic feedback per key, auto-submits once `length` digits are in,
// shakes on a wrong-PIN error) - shared by both the phone+PIN login form
// and the offline PIN-resume screen in App.tsx, since they're otherwise
// the same interaction repeated twice.
export function PinPad({
  value,
  onChange,
  onComplete,
  length = 6,
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
    <View className="gap-6">
      <Animated.View style={shakeStyle} className="flex-row justify-center gap-3">
        {Array.from({ length }).map((_, i) => (
          <View
            key={i}
            className={`h-3.5 w-3.5 rounded-full ${i < value.length ? 'bg-primary' : 'bg-muted'} ${error ? 'bg-destructive' : ''}`}
          />
        ))}
      </Animated.View>

      <View className="flex-row flex-wrap justify-center gap-3">
        {KEYS.map((key, i) => (
          <Pressable
            key={i}
            disabled={disabled || key === ''}
            onPress={() => press(key)}
            android_ripple={key ? { color: '#ffffff30', radius: 32, borderless: true } : undefined}
            className={`h-16 w-16 items-center justify-center rounded-full ${key ? 'bg-card active:opacity-70' : ''}`}
          >
            {key === 'del' ? (
              <Text className="text-xl text-foreground">⌫</Text>
            ) : (
              <Text className="text-xl font-medium text-foreground">{key}</Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
