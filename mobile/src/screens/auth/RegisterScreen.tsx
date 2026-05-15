import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { authApi } from '../../services/api';
import { useAuthStore } from '../../store/auth';

interface RegisterForm {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: 'CARGO_GENERATOR' | 'TRANSPORTER';
  companyName?: string;
}

export default function RegisterScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<'CARGO_GENERATOR' | 'TRANSPORTER'>('CARGO_GENERATOR');
  const login = useAuthStore((s) => s.login);

  const { control, handleSubmit, formState: { errors } } = useForm<RegisterForm>();

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true);
    try {
      const res = await authApi.register({ ...data, role });
      await login(res.data.user, res.data.accessToken);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Error en el registro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>CargoLink</Text>
      <Text style={styles.subtitle}>Crea tu cuenta</Text>

      <View style={styles.form}>
        <View style={styles.roleRow}>
          <TouchableOpacity
            style={[styles.roleBtn, role === 'CARGO_GENERATOR' && styles.roleBtnActive]}
            onPress={() => setRole('CARGO_GENERATOR')}
          >
            <Text style={[styles.roleText, role === 'CARGO_GENERATOR' && styles.roleTextActive]}>Generador de carga</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleBtn, role === 'TRANSPORTER' && styles.roleBtnActive]}
            onPress={() => setRole('TRANSPORTER')}
          >
            <Text style={[styles.roleText, role === 'TRANSPORTER' && styles.roleTextActive]}>Transportista</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Controller
              control={control}
              name="firstName"
              rules={{ required: 'Obligatorio' }}
              render={({ field: { onChange, value } }) => (
                <TextInput style={styles.input} placeholder="Nombre" value={value} onChangeText={onChange} />
              )}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Controller
              control={control}
              name="lastName"
              rules={{ required: 'Obligatorio' }}
              render={({ field: { onChange, value } }) => (
                <TextInput style={styles.input} placeholder="Apellido" value={value} onChangeText={onChange} />
              )}
            />
          </View>
        </View>

        <Controller
          control={control}
          name="email"
          rules={{ required: 'Correo electrónico obligatorio' }}
          render={({ field: { onChange, value } }) => (
            <TextInput style={styles.input} placeholder="Correo electrónico" value={value} onChangeText={onChange} keyboardType="email-address" autoCapitalize="none" />
          )}
        />

        <Controller
          control={control}
          name="password"
          rules={{ required: 'Contraseña obligatoria', minLength: { value: 6, message: 'Mínimo 6 caracteres' } }}
          render={({ field: { onChange, value } }) => (
            <TextInput style={styles.input} placeholder="Contraseña" value={value} onChangeText={onChange} secureTextEntry />
          )}
        />

        <Controller
          control={control}
          name="phone"
          rules={{ required: 'El teléfono es obligatorio' }}
          render={({ field: { onChange, value } }) => (
            <TextInput style={styles.input} placeholder="Teléfono" value={value} onChangeText={onChange} keyboardType="phone-pad" />
          )}
        />

        <Controller
          control={control}
          name="companyName"
          render={({ field: { onChange, value } }) => (
            <TextInput style={styles.input} placeholder="Nombre de Empresa (opcional)" value={value} onChangeText={onChange} />
          )}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Creando...' : 'Crear Cuenta'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.link}>
            ¿Ya tienes una cuenta? <Text style={styles.linkBold}>Iniciar sesión</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2563eb' },
  content: { padding: 24, paddingTop: 60 },
  title: { fontSize: 36, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#bfdbfe', textAlign: 'center', marginTop: 8, marginBottom: 24 },
  form: { backgroundColor: '#fff', borderRadius: 16, padding: 24, gap: 12 },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleBtn: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 2, borderColor: '#e5e7eb', alignItems: 'center' },
  roleBtnActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  roleText: { fontWeight: '600', color: '#6b7280' },
  roleTextActive: { color: '#2563eb' },
  row: { flexDirection: 'row', gap: 8 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 16,
    paddingVertical: 12, fontSize: 16,
  },
  button: {
    backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: '#6b7280', marginTop: 8 },
  linkBold: { color: '#2563eb', fontWeight: '600' },
});
