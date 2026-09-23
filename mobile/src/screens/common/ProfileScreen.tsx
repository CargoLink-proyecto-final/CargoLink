import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { usersApi } from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { getRoleLabel } from '../../lib/labels';
import { User } from '../../types';

/** Campos del form como strings — los inputs de RN sólo manejan texto. */
interface ProfileForm {
  firstName: string;
  lastName: string;
  phone: string;
  companyName: string;
  industry: string;
  zoneLat: string;
  zoneLng: string;
  zoneRadiusKm: string;
}

const EMPTY_FORM: ProfileForm = {
  firstName: '',
  lastName: '',
  phone: '',
  companyName: '',
  industry: '',
  zoneLat: '',
  zoneLng: '',
  zoneRadiusKm: '',
};

function toForm(profile: Partial<User>): ProfileForm {
  return {
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    phone: profile.phone ?? '',
    companyName: profile.companyName ?? '',
    industry: profile.industry ?? '',
    zoneLat: profile.zoneLat != null ? String(profile.zoneLat) : '',
    zoneLng: profile.zoneLng != null ? String(profile.zoneLng) : '',
    zoneRadiusKm: profile.zoneRadiusKm != null ? String(profile.zoneRadiusKm) : '',
  };
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function ProfileScreen({ navigation }: any) {
  const { user, logout } = useAuthStore();
  const [profile, setProfile] = useState<User | null>(null);
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const isTransporter = (profile?.role ?? user?.role) === 'TRANSPORTER';
  const isShipper = (profile?.role ?? user?.role) === 'CARGO_GENERATOR';

  const fetchProfile = useCallback(async () => {
    try {
      const res = await usersApi.getMe();
      setProfile(res.data);
      setForm(toForm(res.data ?? {}));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const setField = (key: keyof ProfileForm) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Atajo para no obligar al transportista a tipear coordenadas a mano: toma su
  // posición actual como centro de la zona.
  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'No pudimos acceder a tu ubicación.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      setForm((prev) => ({
        ...prev,
        zoneLat: position.coords.latitude.toFixed(5),
        zoneLng: position.coords.longitude.toFixed(5),
      }));
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'No pudimos obtener tu ubicación.');
    } finally {
      setLocating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // El DTO rechaza strings vacíos en los campos obligatorios, así que sólo
      // mandamos lo que tiene valor. `industry` sí admite vacío (se puede limpiar).
      const payload: Record<string, unknown> = {};
      if (form.firstName.trim()) payload.firstName = form.firstName.trim();
      if (form.lastName.trim()) payload.lastName = form.lastName.trim();
      if (form.phone.trim()) payload.phone = form.phone.trim();
      if (form.companyName.trim()) payload.companyName = form.companyName.trim();
      if (isShipper) payload.industry = form.industry.trim();
      if (isTransporter) {
        payload.zoneLat = optionalNumber(form.zoneLat);
        payload.zoneLng = optionalNumber(form.zoneLng);
        payload.zoneRadiusKm = optionalNumber(form.zoneRadiusKm);
      }

      const res = await usersApi.updateMe(payload);
      setProfile(res.data);
      setForm(toForm(res.data ?? {}));
      setEditing(false);
      Alert.alert('Perfil actualizado');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'No pudimos guardar los cambios');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setForm(toForm(profile ?? {}));
    setEditing(false);
  };

  const handleLogout = () => {
    Alert.alert('Cerrar Sesión', '¿Estás seguro?', [
      { text: 'Cancelar' },
      { text: 'Cerrar Sesión', style: 'destructive', onPress: () => logout() },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Si /users/me falló todavía tenemos lo que guardó el login en el store.
  const shown = profile ?? (user as Partial<User> | null);
  if (!shown) return null;

  const roleColor =
    shown.role === 'CARGO_GENERATOR' ? '#3b82f6' : shown.role === 'TRANSPORTER' ? '#f97316' : '#8b5cf6';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: roleColor + '20' }]}>
            <Text style={[styles.avatarText, { color: roleColor }]}>
              {shown.firstName?.[0]}
              {shown.lastName?.[0]}
            </Text>
          </View>
          <Text style={styles.name}>
            {shown.firstName} {shown.lastName}
          </Text>
          <Text style={styles.email}>{shown.email}</Text>
          <View style={[styles.roleBadge, { backgroundColor: roleColor + '20' }]}>
            <Text style={[styles.roleText, { color: roleColor }]}>
              {getRoleLabel(shown.role ?? '')}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Datos personales</Text>
            {!editing && (
              <TouchableOpacity onPress={() => setEditing(true)}>
                <Text style={styles.link}>Editar</Text>
              </TouchableOpacity>
            )}
          </View>

          {editing ? (
            <>
              <Text style={styles.label}>Nombre</Text>
              <TextInput
                style={styles.input}
                value={form.firstName}
                onChangeText={setField('firstName')}
                placeholder="Nombre"
              />
              <Text style={styles.label}>Apellido</Text>
              <TextInput
                style={styles.input}
                value={form.lastName}
                onChangeText={setField('lastName')}
                placeholder="Apellido"
              />
              <Text style={styles.label}>Teléfono</Text>
              <TextInput
                style={styles.input}
                value={form.phone}
                onChangeText={setField('phone')}
                placeholder="+54 9 11 ..."
                keyboardType="phone-pad"
              />
              <Text style={styles.label}>Empresa</Text>
              <TextInput
                style={styles.input}
                value={form.companyName}
                onChangeText={setField('companyName')}
                placeholder="Nombre de la empresa"
              />
            </>
          ) : (
            <>
              <Row label="Teléfono" value={shown.phone} />
              <Row label="Empresa" value={shown.companyName} />
            </>
          )}
        </View>

        {isShipper && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Rubro</Text>
            {editing ? (
              <>
                <TextInput
                  style={styles.input}
                  value={form.industry}
                  onChangeText={setField('industry')}
                  placeholder="Ej., Agroindustria"
                />
                <Text style={styles.helper}>
                  Los transportistas lo ven en el detalle de tus cargas.
                </Text>
              </>
            ) : (
              <Row label="Rubro" value={shown.industry} />
            )}
          </View>
        )}

        {isTransporter && (
          <TouchableOpacity
            style={styles.section}
            onPress={() => navigation.navigate('CompleteProfile')}
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Perfil de transportista</Text>
              <Text style={styles.link}>Ver</Text>
            </View>
            <Text style={styles.helper}>Documentos, vehículo y declaración jurada.</Text>
          </TouchableOpacity>
        )}

        {isTransporter && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Zona de influencia</Text>
            <Text style={styles.helper}>
              Las cargas disponibles se ordenan por cercanía a este punto.
            </Text>

            {editing ? (
              <>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Latitud</Text>
                    <TextInput
                      style={styles.input}
                      value={form.zoneLat}
                      onChangeText={setField('zoneLat')}
                      placeholder="-31.42"
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Longitud</Text>
                    <TextInput
                      style={styles.input}
                      value={form.zoneLng}
                      onChangeText={setField('zoneLng')}
                      placeholder="-64.18"
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <Text style={styles.label}>Radio (km)</Text>
                <TextInput
                  style={styles.input}
                  value={form.zoneRadiusKm}
                  onChangeText={setField('zoneRadiusKm')}
                  placeholder="50"
                  keyboardType="numeric"
                />
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={useCurrentLocation}
                  disabled={locating}
                >
                  <Ionicons name="locate-outline" size={18} color="#2563eb" />
                  <Text style={styles.secondaryBtnText}>
                    {locating ? 'Obteniendo ubicación...' : 'Usar mi ubicación actual'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : shown.zoneLat != null && shown.zoneLng != null ? (
              <>
                <Row label="Centro" value={`${shown.zoneLat}, ${shown.zoneLng}`} />
                <Row
                  label="Radio"
                  value={shown.zoneRadiusKm != null ? `${shown.zoneRadiusKm} km` : undefined}
                />
              </>
            ) : (
              <Text style={styles.empty}>Todavía no definiste tu zona.</Text>
            )}
          </View>
        )}

        {editing && (
          <View style={styles.editActions}>
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Guardando...' : 'Guardar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelEdit} disabled={saving}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#ef4444" />
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
        </TouchableOpacity>

        <Text style={styles.version}>CargoLink v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 24, marginTop: 16 },
  avatar: {
    width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: 'bold' },
  name: { fontSize: 22, fontWeight: 'bold' },
  email: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  roleBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 8 },
  roleText: { fontSize: 12, fontWeight: '600' },
  section: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, gap: 6,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#374151' },
  link: { fontSize: 14, fontWeight: '600', color: '#2563eb' },
  label: { fontSize: 13, fontWeight: '500', color: '#6b7280', marginTop: 6 },
  helper: { fontSize: 12, color: '#9ca3af' },
  empty: { fontSize: 13, color: '#9ca3af', marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15,
  },
  row: { flexDirection: 'row', gap: 8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  infoLabel: { fontSize: 13, color: '#9ca3af' },
  infoValue: { fontSize: 14, fontWeight: '500', color: '#374151' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 10, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff',
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: '#2563eb' },
  editActions: { gap: 8, marginBottom: 8 },
  saveBtn: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: '#6b7280', fontSize: 15, fontWeight: '500' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 16, marginTop: 16, backgroundColor: '#fff', borderRadius: 12, gap: 8,
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#ef4444' },
  version: { textAlign: 'center', color: '#9ca3af', fontSize: 12, marginTop: 16, marginBottom: 32 },
});
