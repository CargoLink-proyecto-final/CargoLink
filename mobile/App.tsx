import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { useAuthStore } from './src/store/auth';
import { useMessageNotifications } from './src/hooks/useMessageNotifications';

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    hydrate();
  }, []);

  // Escucha global de mensajes: notifica los que llegan fuera de la
  // conversación abierta, sin importar en qué pantalla esté el usuario.
  useMessageNotifications(userId);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
