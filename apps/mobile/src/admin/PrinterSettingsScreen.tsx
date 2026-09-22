import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { useMutedPlaceholderColor } from '../lib/theme';
import { getPrinterSettings, setPrinterSettings } from '../printer';

// Till-local hardware config, not tenant config - unlike SettingsScreen.tsx's
// business name/receipt header/footer (which PATCH the shared tenant row),
// a printer's IP lives only in THIS device's AsyncStorage (see ../printer.ts)
// - each till points at whatever printer physically sits next to it.
// Deliberately not gated behind owner/manager like SettingsScreen.tsx and
// StaffScreen.tsx: whoever is on shift at a given till is the one who'd need
// to (re)point it at that shop's printer after a network change, and this
// changes nothing tenant-wide. UNVERIFIED against real hardware - see
// ../printer.ts's own note.
export function PrinterSettingsScreen() {
  const placeholderColor = useMutedPlaceholderColor();
  const [host, setHost] = useState('');
  const [port, setPort] = useState('9100');
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPrinterSettings().then((settings) => {
      if (cancelled) return;
      if (settings) {
        setHost(settings.host);
        setPort(String(settings.port));
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setSaved(false);
    await setPrinterSettings(host.trim(), Number(port) || 9100);
    setSaved(true);
  }

  if (!loaded) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-3 p-4" keyboardShouldPersistTaps="handled">
      <Text className="text-sm text-muted-foreground">
        Network receipt printer (Wi-Fi/Ethernet, raw/JetDirect port - 9100 is typical for most thermal receipt
        printers). Leave the IP blank to skip direct printing on this till - the existing Print/Share receipt option
        from Sales keeps working either way.
      </Text>

      <Text className="mt-2 text-sm text-muted-foreground">Printer IP address</Text>
      <TextInput
        className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
        placeholder="e.g. 192.168.1.50"
        placeholderTextColor={placeholderColor}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="numbers-and-punctuation"
        value={host}
        onChangeText={setHost}
      />

      <Text className="mt-2 text-sm text-muted-foreground">Port</Text>
      <TextInput
        className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
        placeholder="9100"
        placeholderTextColor={placeholderColor}
        keyboardType="number-pad"
        value={port}
        onChangeText={setPort}
      />

      {saved ? <Text className="text-primary">Saved.</Text> : null}

      <Pressable android_ripple={{ color: '#ffffff40' }} className="mt-2 items-center rounded-lg bg-primary py-3 active:opacity-80" onPress={handleSave}>
        <Text className="font-medium text-primary-foreground">Save printer settings</Text>
      </Pressable>
    </ScrollView>
  );
}
