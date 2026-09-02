import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import Animated, { ZoomIn, SlideInDown, FadeOut } from 'react-native-reanimated';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertState {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

interface ToastState {
  id: number;
  message: string;
}

// A themed drop-in for RN's native Alert.alert (which renders as the OS's
// own system dialog on Android - always light-themed, never matching this
// app's dark/light palette) plus a lightweight auto-dismissing toast for
// low-stakes success notices. Both are driven by module-level setters
// captured from the single <AppNoticeHost/> mounted once near the app root
// (App.tsx), so any file can call showAlert/showToast without needing its
// own Modal/state - same imperative ergonomics as Alert.alert itself.
let setAlertState: Dispatch<SetStateAction<AlertState | null>> | null = null;
let setToastState: Dispatch<SetStateAction<ToastState | null>> | null = null;
let toastSeq = 0;

export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  setAlertState?.({ title, message, buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }] });
}

export function showToast(message: string, durationMs = 2500) {
  const id = ++toastSeq;
  setToastState?.({ id, message });
  setTimeout(() => {
    setToastState?.((current) => (current?.id === id ? null : current));
  }, durationMs);
}

export function AppNoticeHost() {
  const [alertState, setLocalAlertState] = useState<AlertState | null>(null);
  const [toastState, setLocalToastState] = useState<ToastState | null>(null);

  useEffect(() => {
    setAlertState = setLocalAlertState;
    setToastState = setLocalToastState;
    return () => {
      setAlertState = null;
      setToastState = null;
    };
  }, []);

  return (
    <>
      {alertState ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setLocalAlertState(null)}>
          <Pressable className="flex-1 items-center justify-center bg-black/50 px-8" onPress={() => setLocalAlertState(null)}>
            <Animated.View
              entering={ZoomIn.duration(180)}
              className="w-full max-w-sm gap-3 rounded-2xl border border-border bg-card p-5"
              onStartShouldSetResponder={() => true}
            >
              <Text className="text-lg font-semibold text-foreground">{alertState.title}</Text>
              {alertState.message ? <Text className="text-muted-foreground">{alertState.message}</Text> : null}
              <View className="mt-2 flex-row justify-end gap-2">
                {alertState.buttons.map((button, i) => (
                  <Pressable
                    key={i}
                    android_ripple={{ color: button.style === 'cancel' ? undefined : '#ffffff40' }}
                    className={`rounded-lg px-4 py-2 ${
                      button.style === 'destructive' ? 'bg-destructive' : button.style === 'cancel' ? 'border border-border' : 'bg-primary'
                    }`}
                    onPress={() => {
                      setLocalAlertState(null);
                      button.onPress?.();
                    }}
                  >
                    <Text className={`text-sm font-medium ${button.style === 'cancel' ? 'text-foreground' : 'text-primary-foreground'}`}>{button.text}</Text>
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          </Pressable>
        </Modal>
      ) : null}

      {toastState ? (
        <View pointerEvents="none" className="absolute inset-x-0 bottom-24 items-center px-6">
          <Animated.View key={toastState.id} entering={SlideInDown.duration(220)} exiting={FadeOut.duration(180)} className="max-w-full rounded-full bg-foreground px-4 py-2.5">
            <Text className="text-sm font-medium text-background">{toastState.message}</Text>
          </Animated.View>
        </View>
      ) : null}
    </>
  );
}
