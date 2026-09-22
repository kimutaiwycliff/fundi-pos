import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';

// This app has no offline capability left (see the App.tsx/db removal this
// shipped alongside) - a dropped connection now means a cashier genuinely
// can't sell or log in, so unlike before there's real value in making that
// visible at a glance, the same way apps/desktop's Till.tsx already shows a
// wifi/wifi-off status pill. Reflects NetInfo's own reachability signal only
// (isConnected && isInternetReachable !== false - undecided still reads as
// online rather than flashing "Offline" for the brief moment NetInfo hasn't
// finished its first check yet), nothing app-specific like a failed fetch.
export function NetworkStatusPill() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(Boolean(state.isConnected) && state.isInternetReachable !== false);
    });
    return unsubscribe;
  }, []);

  return (
    <View
      className={`flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1 ${online ? 'bg-muted' : 'bg-destructive/15'}`}
    >
      <Ionicons name={online ? 'wifi-outline' : 'cloud-offline-outline'} size={13} color={online ? '#71717a' : '#ef4444'} />
      <Text className={`text-xs font-medium ${online ? 'text-muted-foreground' : 'text-destructive'}`}>
        {online ? 'Online' : 'Offline'}
      </Text>
    </View>
  );
}
