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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { loadsApi } from '../../services/api';

interface LoadForm {
  title: string;
  description?: string;
  originAddress: string;
  originLat: string;
  originLng: string;
  destAddress: string;
  destLat: string;
  destLng: string;
  cargoType: string;
  weight: string;
  volume?: string;
  pickupDate: string;
  deliveryDate?: string;
  price: string;
}

export default function CreateLoadScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const { control, handleSubmit, reset } = useForm<LoadForm>();

  const onSubmit = async (data: LoadForm) => {
    setLoading(true);
    try {
      await loadsApi.create({
        title: data.title,
        description: data.description,
        originAddress: data.originAddress,
        originLat: parseFloat(data.originLat),
        originLng: parseFloat(data.originLng),
        destAddress: data.destAddress,
        destLat: parseFloat(data.destLat),
        destLng: parseFloat(data.destLng),
        cargoType: data.cargoType,
        weight: parseFloat(data.weight),
        volume: data.volume ? parseFloat(data.volume) : undefined,
        pickupDate: new Date(data.pickupDate).toISOString(),
        deliveryDate: data.deliveryDate ? new Date(data.deliveryDate).toISOString() : undefined,
        price: parseFloat(data.price),
      });
      Alert.alert('Éxito', 'Carga creada exitosamente');
      reset();
      navigation.navigate('Dashboard');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Error al crear la carga');
    } finally {
      setLoading(false);
    }
  };

  const Field = ({ name, label, placeholder, keyboardType, rules }: any) => (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Controller
        control={control}
        name={name}
        rules={rules}
        render={({ field: { onChange, value } }) => (
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            value={value}
            onChangeText={onChange}
            keyboardType={keyboardType || 'default'}
          />
        )}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Crear Nueva Carga</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalles de la Carga</Text>
          <Field name="title" label="Título" placeholder="Ej., Electrónica a Córdoba" rules={{ required: true }} />
          <Field name="description" label="Descripción" placeholder="Detalles adicionales" />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field name="cargoType" label="Tipo de Carga" placeholder="Electrónica" rules={{ required: true }} />
            </View>
            <View style={{ flex: 1 }}>
              <Field name="weight" label="Peso (kg)" placeholder="5000" keyboardType="numeric" rules={{ required: true }} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field name="volume" label="Volumen (m3)" placeholder="12.5" keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Field name="price" label="Precio (ARS)" placeholder="150000" keyboardType="numeric" rules={{ required: true }} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Origen</Text>
          <Field name="originAddress" label="Dirección" placeholder="Dirección de origen" rules={{ required: true }} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field name="originLat" label="Latitud" placeholder="-34.6037" keyboardType="numeric" rules={{ required: true }} />
            </View>
            <View style={{ flex: 1 }}>
              <Field name="originLng" label="Longitud" placeholder="-58.3816" keyboardType="numeric" rules={{ required: true }} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Destino</Text>
          <Field name="destAddress" label="Dirección" placeholder="Dirección de destino" rules={{ required: true }} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field name="destLat" label="Latitud" placeholder="-31.4201" keyboardType="numeric" rules={{ required: true }} />
            </View>
            <View style={{ flex: 1 }}>
              <Field name="destLng" label="Longitud" placeholder="-64.1888" keyboardType="numeric" rules={{ required: true }} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Field name="pickupDate" label="Fecha de Recogida (AAAA-MM-DD)" placeholder="2024-03-01" rules={{ required: true }} />
          <Field name="deliveryDate" label="Fecha de Entrega (AAAA-MM-DD, opcional)" placeholder="2024-04-01" />
        </View>

        <TouchableOpacity
          style={[styles.button, loading && { opacity: 0.6 }]}
          onPress={handleSubmit(onSubmit)}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Creando...' : 'Crear Carga'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '500', color: '#6b7280', marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 10, fontSize: 15,
  },
  row: { flexDirection: 'row', gap: 8 },
  button: {
    backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 16, alignItems: 'center',
    marginBottom: 40,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
