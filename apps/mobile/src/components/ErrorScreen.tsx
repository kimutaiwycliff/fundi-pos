import { Pressable, Text, View } from 'react-native';

// Friendly full-screen fallback for a caught render error (see
// ErrorBoundary.tsx). There's no navigation-based "go back" that makes sense
// here - a render error means the tree itself blew up, not that the user
// took a wrong turn - so the only action offered is a retry that asks the
// boundary to re-render the tree from scratch, matching App.tsx's existing
// PrimaryButton styling (rounded-lg bg-primary, same android_ripple color)
// rather than introducing a new button style.
export function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-8">
      <Text className="text-center text-2xl font-semibold text-foreground">Something went wrong</Text>
      <Text className="text-center text-muted-foreground">Fundi Till ran into an unexpected error. Try again - if it keeps happening, restart the app.</Text>
      <Pressable android_ripple={{ color: '#ffffff40' }} className="items-center overflow-hidden rounded-lg bg-primary px-6 py-3 active:opacity-80" onPress={onRetry}>
        <Text className="font-medium text-primary-foreground">Try again</Text>
      </Pressable>
    </View>
  );
}
