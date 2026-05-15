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

export default function ForgotPasswordScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { control, handleSubmit, formState: { errors } } = useForm<{ email: string }>();

  const onSubmit = async (data: { email: string }) => {
    setLoading(true);
    try {
      await authApi.forgotPassword(data.email);
      setSubmitted(true);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Algo salió mal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>CargoLink</Text>
        <Text style={styles.subtitle}>Restablecer tu contraseña</Text>

        <View style={styles.form}>
          {submitted ? (
            <>
              <View style={styles.successBox}>
                <Text style={styles.successText}>
                  Si existe una cuenta con ese correo electrónico, se ha enviado un enlace de restablecimiento.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.button}
                onPress={() => navigation.navigate('Login')}
              >
                <Text style={styles.buttonText}>Volver al inicio de sesión</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
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

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSubmit(onSubmit)}
                disabled={loading}
              >
                <Text style={styles.buttonText}>{loading ? 'Enviando...' : 'Enviar Enlace'}</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.link}>Volver al inicio de sesión</Text>
              </TouchableOpacity>
            </>
          )}
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
    backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#ef4444', fontSize: 12, marginTop: -4 },
  link: { textAlign: 'center', color: '#2563eb', fontWeight: '600', marginTop: 12 },
  successBox: { backgroundColor: '#f0fdf4', padding: 16, borderRadius: 10 },
  successText: { color: '#166534', fontSize: 14, textAlign: 'center' },
});
