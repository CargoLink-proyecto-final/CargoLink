import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/auth';
import { getRoleLabel } from '../../lib/labels';

const WEB_URL = 'https://plataforma.cargolink.com.ar';

/**
 * Pantalla para los roles que la app no cubre: ADMIN y COMPANY_ADMIN.
 *
 * Antes caían en la interfaz de dador de carga, que pega a `GET /loads/my` —
 * restringido a CARGO_GENERATOR — así que veían una pantalla de error 403 sin
 * explicación y sin nada que pudieran hacer.
 *
 * El perfil sigue accesible desde la otra pestaña: ahí están cerrar sesión y
 * eliminar la cuenta, que tienen que poder usar igual.
 */
export default function UnsupportedRoleScreen() {
  const user = useAuthStore((s) => s.user);

  const openWeb = () => {
    Linking.openURL(WEB_URL).catch(() => undefined);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Ionicons name="desktop-outline" size={56} color="#2563EB" />

        <Text style={styles.title}>Esta cuenta se administra desde el web</Text>

        <Text style={styles.body}>
          {user?.role ? `Tu rol es ${getRoleLabel(user.role)}. ` : ''}
          La app está pensada para publicar cargas y para transportarlas. Las
          tareas de administración están en la versión web, con pantalla grande.
        </Text>

        <TouchableOpacity style={styles.primaryBtn} onPress={openWeb}>
          <Text style={styles.primaryText}>Abrir CargoLink en el navegador</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Desde la pestaña Perfil podés ver tus datos, cerrar sesión o eliminar tu
          cuenta.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  title: {
    fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center', marginTop: 8,
  },
  body: { fontSize: 15, lineHeight: 22, color: '#4b5563', textAlign: 'center' },
  // 44px de alto mínimo, como el resto de los botones de la app.
  primaryBtn: {
    marginTop: 8, paddingVertical: 14, paddingHorizontal: 24,
    backgroundColor: '#2563EB', borderRadius: 12,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 13, color: '#9ca3af', textAlign: 'center', marginTop: 8 },
});
