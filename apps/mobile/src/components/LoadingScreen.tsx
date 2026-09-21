import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

// Same literal brand orange as App.tsx's pre-this ActivityIndicator and
// app.json's Android adaptive icon background - a fixed brand mark color
// that shouldn't flip with light/dark theme the way the `primary` NativeWind
// token does.
const BRAND_ORANGE = '#df5102';

// Full-screen branded loading view shown once JS has mounted - takes over
// from app.json's OS-level expo-splash-screen (shown before JS is ready)
// and replaces the bare ActivityIndicator App.tsx previously rendered for
// its `initializing` branch. Kept deliberately simple: a gentle looping
// pulse (opacity + scale) on the business name via reanimated, same
// useSharedValue/useAnimatedStyle pattern PinPad.tsx already uses in this
// app rather than anything more elaborate.
export function LoadingScreen() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; `pulse` is a stable shared-value ref, matching PinPad.tsx's identical shake effect
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + pulse.value * 0.5,
    transform: [{ scale: 0.94 + pulse.value * 0.06 }],
  }));

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Animated.Text style={[pulseStyle, { color: BRAND_ORANGE }]} className="text-2xl font-bold">
        Fundi Till
      </Animated.Text>
    </View>
  );
}
