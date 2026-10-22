import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { authApi } from '../../services/api';
import { useAuthStore } from '../../store/auth';

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);

  const { control, handleSubmit, formState: { errors } } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      const res = await authApi.login(data);
      await login(res.data.user, res.data.accessToken);
    } catch (err: any) {
      const body = err.response?.data;

      // El backend devuelve 403 con este código cuando falta verificar el mail.
      // Sin ofrecer el reenvío acá, el usuario quedaba trabado: el enlace vence
      // y desde el teléfono no había forma de pedir otro.
      if (body?.code === 'EMAIL_NOT_VERIFIED') {
        Alert.alert(
          'Falta verificar tu correo',
          `${body.message ?? 'Tenés que verificar tu correo antes de entrar.'}\n\n¿Querés que te mandemos el enlace de nuevo?`,
          [
            { text: 'Ahora no' },
            {
              text: 'Reenviar',
              onPress: () => resendVerification(body.email ?? data.email),
            },
          ],
        );
        return;
      }

      Alert.alert('Error', body?.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async (email: string) => {
    try {
      const res = await authApi.resendVerification(email);
      // La respuesta es opaca a propósito (no revela si la cuenta existe), así
      // que el mensaje del backend ya viene redactado para mostrarse tal cual.
      Alert.alert('Listo', res.data?.message ?? 'Si la cuenta existe, te llegará un enlace nuevo.');
    } catch {
      Alert.alert('No pudimos reenviarlo', 'Intentá de nuevo en un rato.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>CargoLink</Text>
        <Text style={styles.subtitle}>Inicia sesión en tu cuenta</Text>

        <View style={styles.form}>
          <Controller
            control={control}
            name="email"
            rules={{ required: 'El correo electrónico es obligatorio' }}
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={styles.input}
                placeholder="Correo electrónico *"
                value={value}
                onChangeText={onChange}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            )}
          />
          {errors.email && <Text style={styles.error}>{errors.email.message}</Text>}

          <Controller
            control={control}
            name="password"
            rules={{ required: 'La contraseña es obligatoria' }}
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={styles.input}
                placeholder="Contraseña *"
                value={value}
                onChangeText={onChange}
                secureTextEntry
              />
            )}
          />
          {errors.password && <Text style={styles.error}>{errors.password.message}</Text>}

          <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
            <Text style={styles.forgotLink}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.link}>
              ¿No tienes una cuenta? <Text style={styles.linkBold}>Registrarse</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2563eb' },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 36, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#bfdbfe', textAlign: 'center', marginTop: 8, marginBottom: 32 },
  form: { backgroundColor: '#fff', borderRadius: 16, padding: 24, gap: 12 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 16,
    paddingVertical: 12, fontSize: 16,
  },
  button: {
    backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 14, alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#ef4444', fontSize: 12, marginTop: -4 },
  forgotLink: { textAlign: 'right', color: '#2563eb', fontSize: 13 },
  link: { textAlign: 'center', color: '#6b7280', marginTop: 12 },
  linkBold: { color: '#2563eb', fontWeight: '600' },
});
