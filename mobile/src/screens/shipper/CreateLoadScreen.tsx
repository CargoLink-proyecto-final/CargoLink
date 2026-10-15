import React, { useEffect, useRef, useState } from 'react';
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
import { useForm, Controller, Control } from 'react-hook-form';
import { loadsApi } from '../../services/api';
import { CARGO_TYPES, showsPackageDetails } from '../../constants/cargo';
import { BODY_TYPES } from '../../lib/transporterProfile';
import {
  EMPTY_REQUIREMENTS,
  suggestedBodyType,
  VehicleRequirements,
} from '../../lib/vehicleRequirements';
import { BodyType } from '../../types';

const BODY_OPTIONS: { value: BodyType | null; label: string }[] = [
  { value: null, label: 'Cualquiera' },
  ...BODY_TYPES,
];

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
  packageCount?: string;
  heightCm?: string;
  widthCm?: string;
  lengthCm?: string;
  pickupDate: string;
  deliveryDate: string;
  price?: string;
}

/** `undefined` en vez de NaN cuando el campo opcional quedó vacío. */
function optionalNumber(value?: string): number | undefined {
  if (!value || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// Definido fuera del componente a propósito: como componente inline se
// remontaría en cada render y el TextInput perdería el foco a cada tecla.
function Field({
  control,
  name,
  label,
  placeholder,
  keyboardType,
  rules,
  helper,
}: {
  control: Control<LoadForm>;
  name: keyof LoadForm;
  label: string;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  rules?: any;
  helper?: string;
}) {
  return (
    <View>
      <Text style={styles.label}>
        {label}
        {rules?.required && <Text style={styles.required}> *</Text>}
      </Text>
      <Controller
        control={control}
        name={name}
        rules={rules}
        render={({ field: { onChange, value } }) => (
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            value={value as string}
            onChangeText={onChange}
            keyboardType={keyboardType || 'default'}
          />
        )}
      />
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

export default function CreateLoadScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [requirements, setRequirements] = useState<VehicleRequirements>(EMPTY_REQUIREMENTS);
  const { control, handleSubmit, reset, watch } = useForm<LoadForm>();

  const cargoType = watch('cargoType');
  const showPackage = showsPackageDetails(cargoType);

  // La categoría sugiere la carrocería mientras el publicador no la haya
  // tocado a mano (ver lib/vehicleRequirements).
  const requirementsTouched = useRef(false);
  useEffect(() => {
    if (requirementsTouched.current || !cargoType) return;
    setRequirements((prev) => ({ ...prev, requiredBodyType: suggestedBodyType(cargoType) }));
  }, [cargoType]);
  const changeRequirements = (patch: Partial<VehicleRequirements>) => {
    requirementsTouched.current = true;
    setRequirements((prev) => ({ ...prev, ...patch }));
  };

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
        volume: optionalNumber(data.volume),
        // Sólo mandamos info del bulto para los tipos que la muestran: si el
        // usuario cambió de tipo de carga después de completarla, quedaría vieja.
        packageCount: showPackage ? optionalNumber(data.packageCount) : undefined,
        heightCm: showPackage ? optionalNumber(data.heightCm) : undefined,
        widthCm: showPackage ? optionalNumber(data.widthCm) : undefined,
        lengthCm: showPackage ? optionalNumber(data.lengthCm) : undefined,
        pickupDate: new Date(data.pickupDate).toISOString(),
        deliveryDate: new Date(data.deliveryDate).toISOString(),
        // Vacío = "a convenir": no mandamos el campo en vez de un 0 engañoso.
        price: optionalNumber(data.price),
        ...requirements,
      });
      Alert.alert('Éxito', 'Carga creada exitosamente');
      reset();
      requirementsTouched.current = false;
      setRequirements(EMPTY_REQUIREMENTS);
      navigation.navigate('Dashboard');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Error al crear la carga');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Crear Nueva Carga</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalles de la Carga</Text>
          <Field control={control} name="title" label="Título" placeholder="Ej., Electrónica a Córdoba" rules={{ required: true }} />
          <Field control={control} name="description" label="Descripción" placeholder="Detalles adicionales" />

          <View>
            <Text style={styles.label}>
              Tipo de Carga<Text style={styles.required}> *</Text>
            </Text>
            <Controller
              control={control}
              name="cargoType"
              rules={{ required: true }}
              render={({ field: { onChange, value } }) => (
                <View style={styles.chips}>
                  {CARGO_TYPES.map((type) => {
                    const selected = value === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[styles.chip, selected && styles.chipSelected]}
                        onPress={() => onChange(type)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                          {type}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            />
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field control={control} name="weight" label="Peso (kg)" placeholder="5000" keyboardType="numeric" rules={{ required: true }} />
            </View>
            <View style={{ flex: 1 }}>
              <Field control={control} name="volume" label="Volumen (m3)" placeholder="12.5" keyboardType="numeric" />
            </View>
          </View>
          <Field
            control={control}
            name="price"
            label="Precio (ARS)"
            placeholder="150000"
            keyboardType="numeric"
            helper="Opcional: vacío = a convenir, lo proponen los transportistas."
          />

          {showPackage && (
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>Información del bulto (opcional)</Text>
              <Field control={control} name="packageCount" label="Cantidad de bultos" placeholder="10" keyboardType="numeric" />
              <Text style={styles.label}>Dimensiones del bulto (cm)</Text>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Field control={control} name="heightCm" label="Alto" placeholder="120" keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field control={control} name="widthCm" label="Ancho" placeholder="80" keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field control={control} name="lengthCm" label="Largo" placeholder="100" keyboardType="numeric" />
                </View>
              </View>
              <Text style={styles.helper}>
                Ayuda a evaluar la compatibilidad con otras cargas para compartir un mismo viaje.
              </Text>
            </View>
          )}

          {/* El publicador describe lo que necesita su carga; el tamaño del
              vehículo sale del peso y el volumen. */}
          <View style={styles.subSection}>
            <Text style={styles.subSectionTitle}>Lo que necesita tu carga</Text>
            <Text style={styles.label}>Carrocería</Text>
            <View style={styles.chips}>
              {BODY_OPTIONS.map(({ value, label }) => {
                const selected = requirements.requiredBodyType === value;
                return (
                  <TouchableOpacity
                    key={value ?? 'ANY'}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => changeRequirements({ requiredBodyType: value })}
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!requirementsTouched.current && !!cargoType && (
              <Text style={styles.helper}>Sugerida según el tipo de carga, podés cambiarla.</Text>
            )}
            <View style={styles.chips}>
              {(
                [
                  ['requiresRefrigeration', 'Necesita frío'],
                  ['requiresHazmat', 'Carga peligrosa'],
                ] as const
              ).map(([key, label]) => {
                const selected = requirements[key];
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => changeRequirements({ [key]: !selected })}
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.helper}>
              No hace falta elegir el tamaño del vehículo: se calcula con el peso y el volumen.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Origen</Text>
          <Field control={control} name="originAddress" label="Dirección" placeholder="Dirección de origen" rules={{ required: true }} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field control={control} name="originLat" label="Latitud" placeholder="-34.6037" keyboardType="numeric" rules={{ required: true }} />
            </View>
            <View style={{ flex: 1 }}>
              <Field control={control} name="originLng" label="Longitud" placeholder="-58.3816" keyboardType="numeric" rules={{ required: true }} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Destino</Text>
          <Field control={control} name="destAddress" label="Dirección" placeholder="Dirección de destino" rules={{ required: true }} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field control={control} name="destLat" label="Latitud" placeholder="-31.4201" keyboardType="numeric" rules={{ required: true }} />
            </View>
            <View style={{ flex: 1 }}>
              <Field control={control} name="destLng" label="Longitud" placeholder="-64.1888" keyboardType="numeric" rules={{ required: true }} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Field control={control} name="pickupDate" label="Fecha de Recogida (AAAA-MM-DD)" placeholder="2024-03-01" rules={{ required: true }} />
          {/* Obligatoria: `CreateLoadDto.deliveryDate` es @IsDateString() sin
              @IsOptional(), así que mandarla vacía devuelve 400. */}
          <Field
            control={control}
            name="deliveryDate"
            label="Fecha deseada de entrega (AAAA-MM-DD)"
            placeholder="2024-04-01"
            rules={{ required: true }}
            helper="Fecha estimativa solicitada; no es la fecha definitiva del viaje."
          />
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
  subSection: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, gap: 10,
  },
  subSectionTitle: { fontSize: 14, fontWeight: '600', color: '#374151' },
  label: { fontSize: 13, fontWeight: '500', color: '#6b7280', marginBottom: 4 },
  helper: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  required: { color: '#ef4444' },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 10, fontSize: 15,
  },
  row: { flexDirection: 'row', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
    borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff',
  },
  chipSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  button: {
    backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 16, alignItems: 'center',
    marginBottom: 40,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
