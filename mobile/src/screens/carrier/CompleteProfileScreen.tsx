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
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { usersApi, transporterProfileApi } from '../../services/api';
import {
  DOCUMENT_TYPES,
  LICENSE_CATEGORIES,
  VEHICLE_TYPES,
  describeMissing,
  isNotExpired,
} from '../../lib/transporterProfile';

// AAAA-MM-DD — el único formato que el backend acepta como fecha. Sin este
// chequeo, algo como "31/12/2027" pasaba la comparación de isNotExpired en
// falso (compara como texto, no como fecha) y recién fallaba en el server.
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

function validateExpiryDate(dateStr: string, label: string): string | null {
  if (!DATE_FORMAT.test(dateStr)) return `${label}: usá el formato AAAA-MM-DD`;
  if (!isNotExpired(dateStr)) return `${label}: está vencida — poné la fecha del próximo vencimiento`;
  return null;
}
import {
  DocumentType,
  ProfileStatus,
  TransporterDocument,
  User,
  Vehicle,
  VehicleType,
} from '../../types';

// Versión del texto de la declaración jurada — se guarda junto a la fecha de
// aceptación para poder demostrar qué versión aceptó cada usuario si el texto
// cambia más adelante.
const TERMS_VERSION = '2026-09-22';

interface PersonalForm {
  cuit: string;
  licenseCategory: string;
  licenseExpiresAt: string;
}

interface VehicleForm {
  plate: string;
  brand: string;
  model: string;
  year: string;
  type: VehicleType;
  maxWeightKg: string;
  maxVolumeM3: string;
  heightCm: string;
  widthCm: string;
  lengthCm: string;
  refrigerated: boolean;
  hazardousMaterials: boolean;
  bulkLiquid: boolean;
  insuranceExpiresAt: string;
  vtvExpiresAt: string;
}

const EMPTY_VEHICLE_FORM: VehicleForm = {
  plate: '',
  brand: '',
  model: '',
  year: '',
  type: 'CAMION',
  maxWeightKg: '',
  maxVolumeM3: '',
  heightCm: '',
  widthCm: '',
  lengthCm: '',
  refrigerated: false,
  hazardousMaterials: false,
  bulkLiquid: false,
  insuranceExpiresAt: '',
  vtvExpiresAt: '',
};

function toPersonalForm(profile: Partial<User>): PersonalForm {
  return {
    cuit: profile.cuit ?? '',
    licenseCategory: profile.licenseCategory ?? '',
    licenseExpiresAt: profile.licenseExpiresAt ? profile.licenseExpiresAt.slice(0, 10) : '',
  };
}

function toVehicleForm(vehicle: Vehicle): VehicleForm {
  return {
    plate: vehicle.plate,
    brand: vehicle.brand,
    model: vehicle.model,
    year: String(vehicle.year),
    type: vehicle.type,
    maxWeightKg: String(vehicle.maxWeightKg),
    maxVolumeM3: vehicle.maxVolumeM3 != null ? String(vehicle.maxVolumeM3) : '',
    heightCm: vehicle.heightCm != null ? String(vehicle.heightCm) : '',
    widthCm: vehicle.widthCm != null ? String(vehicle.widthCm) : '',
    lengthCm: vehicle.lengthCm != null ? String(vehicle.lengthCm) : '',
    refrigerated: vehicle.refrigerated,
    hazardousMaterials: vehicle.hazardousMaterials,
    bulkLiquid: vehicle.bulkLiquid,
    insuranceExpiresAt: vehicle.insuranceExpiresAt ? vehicle.insuranceExpiresAt.slice(0, 10) : '',
    vtvExpiresAt: vehicle.vtvExpiresAt ? vehicle.vtvExpiresAt.slice(0, 10) : '',
  };
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function CompleteProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<User | null>(null);
  const [documents, setDocuments] = useState<TransporterDocument[]>([]);
  const [status, setStatus] = useState<ProfileStatus | null>(null);
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null);

  const [personalForm, setPersonalForm] = useState<PersonalForm>({
    cuit: '',
    licenseCategory: '',
    licenseExpiresAt: '',
  });
  const [savingPersonal, setSavingPersonal] = useState(false);

  const [vehicleForm, setVehicleForm] = useState<VehicleForm>(EMPTY_VEHICLE_FORM);
  const [savingVehicle, setSavingVehicle] = useState(false);

  const [termsChecked, setTermsChecked] = useState(false);
  const [savingTerms, setSavingTerms] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [profileRes, docsRes, vehicleRes, statusRes] = await Promise.all([
        usersApi.getMe(),
        transporterProfileApi.listDocuments(),
        transporterProfileApi.getVehicle(),
        transporterProfileApi.getStatus(),
      ]);
      setProfile(profileRes.data);
      setPersonalForm(toPersonalForm(profileRes.data ?? {}));
      setDocuments(docsRes.data ?? []);
      if (vehicleRes.data) setVehicleForm(toVehicleForm(vehicleRes.data));
      setStatus(statusRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const refreshStatusAndDocs = async () => {
    try {
      const [docsRes, statusRes] = await Promise.all([
        transporterProfileApi.listDocuments(),
        transporterProfileApi.getStatus(),
      ]);
      setDocuments(docsRes.data ?? []);
      setStatus(statusRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSavePersonal = async () => {
    const dateError = validateExpiryDate(personalForm.licenseExpiresAt.trim(), 'Vencimiento de la licencia');
    if (dateError) {
      Alert.alert('Fecha inválida', dateError);
      return;
    }
    setSavingPersonal(true);
    try {
      const res = await usersApi.updateMe({
        cuit: personalForm.cuit.trim(),
        licenseCategory: personalForm.licenseCategory.trim(),
        licenseExpiresAt: personalForm.licenseExpiresAt.trim(),
      });
      setProfile(res.data);
      await refreshStatusAndDocs();
      Alert.alert('Datos guardados');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'No pudimos guardar tus datos');
    } finally {
      setSavingPersonal(false);
    }
  };

  const handleSaveVehicle = async () => {
    const insurance = vehicleForm.insuranceExpiresAt.trim();
    const vtv = vehicleForm.vtvExpiresAt.trim();
    const dateError =
      (insurance ? validateExpiryDate(insurance, 'Vencimiento del seguro') : null) ??
      (vtv ? validateExpiryDate(vtv, 'Vencimiento de la VTV') : null);
    if (dateError) {
      Alert.alert('Fecha inválida', dateError);
      return;
    }
    setSavingVehicle(true);
    try {
      await transporterProfileApi.upsertVehicle({
        plate: vehicleForm.plate.trim(),
        brand: vehicleForm.brand.trim(),
        model: vehicleForm.model.trim(),
        year: Number(vehicleForm.year),
        type: vehicleForm.type,
        maxWeightKg: Number(vehicleForm.maxWeightKg),
        maxVolumeM3: optionalNumber(vehicleForm.maxVolumeM3),
        heightCm: optionalNumber(vehicleForm.heightCm),
        widthCm: optionalNumber(vehicleForm.widthCm),
        lengthCm: optionalNumber(vehicleForm.lengthCm),
        refrigerated: vehicleForm.refrigerated,
        hazardousMaterials: vehicleForm.hazardousMaterials,
        bulkLiquid: vehicleForm.bulkLiquid,
        insuranceExpiresAt: vehicleForm.insuranceExpiresAt.trim() || undefined,
        vtvExpiresAt: vehicleForm.vtvExpiresAt.trim() || undefined,
      });
      await refreshStatusAndDocs();
      Alert.alert('Vehículo guardado');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'No pudimos guardar el vehículo');
    } finally {
      setSavingVehicle(false);
    }
  };

  const handleAcceptTerms = async () => {
    setSavingTerms(true);
    try {
      await transporterProfileApi.acceptTerms(TERMS_VERSION);
      const res = await usersApi.getMe();
      setProfile(res.data);
      await refreshStatusAndDocs();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'No pudimos registrar la aceptación');
    } finally {
      setSavingTerms(false);
    }
  };

  const uploadAsset = async (type: DocumentType, uri: string, name: string, mimeType: string) => {
    setUploadingType(type);
    try {
      await transporterProfileApi.uploadDocument(type, uri, name, mimeType);
      await refreshStatusAndDocs();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'No pudimos subir el archivo');
    } finally {
      setUploadingType(null);
    }
  };

  const handleTakePhoto = async (type: DocumentType) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permiso denegado', 'No pudimos acceder a la cámara.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await uploadAsset(type, asset.uri, asset.fileName ?? `${type}.jpg`, asset.mimeType ?? 'image/jpeg');
  };

  const handlePickFile = async (type: DocumentType) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/jpeg', 'image/png', 'application/pdf'],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await uploadAsset(type, asset.uri, asset.name, asset.mimeType ?? 'application/octet-stream');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const documentByType = new Map(documents.map((d) => [d.type, d]));

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
        {status && (
          <View style={[styles.statusCard, status.complete ? styles.statusOk : styles.statusWarn]}>
            {status.complete ? (
              <Text style={styles.statusOkText}>
                ✓ Tu perfil está completo. Ya podés postularte a cargas.
              </Text>
            ) : (
              <>
                <Text style={styles.statusWarnTitle}>Te falta completar:</Text>
                {status.missing.map((code) => (
                  <Text key={code} style={styles.statusWarnItem}>
                    • {describeMissing(code)}
                  </Text>
                ))}
              </>
            )}
          </View>
        )}

        {/* Datos personales */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos personales</Text>
          <Text style={styles.label}>CUIT/CUIL</Text>
          <TextInput
            style={styles.input}
            value={personalForm.cuit}
            onChangeText={(v) => setPersonalForm((p) => ({ ...p, cuit: v }))}
            placeholder="20-12345678-3"
          />
          <Text style={styles.label}>Categoría de licencia</Text>
          <View style={styles.chipRow}>
            {LICENSE_CATEGORIES.map((category) => (
              <TouchableOpacity
                key={category}
                style={[styles.chip, personalForm.licenseCategory === category && styles.chipActive]}
                onPress={() => setPersonalForm((p) => ({ ...p, licenseCategory: category }))}
              >
                <Text
                  style={[
                    styles.chipText,
                    personalForm.licenseCategory === category && styles.chipTextActive,
                  ]}
                >
                  {category}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Vencimiento de la licencia</Text>
          <TextInput
            style={styles.input}
            value={personalForm.licenseExpiresAt}
            onChangeText={(v) => setPersonalForm((p) => ({ ...p, licenseExpiresAt: v }))}
            placeholder="AAAA-MM-DD"
          />
          <TouchableOpacity
            style={[styles.saveBtn, savingPersonal && styles.btnDisabled]}
            onPress={handleSavePersonal}
            disabled={savingPersonal}
          >
            <Text style={styles.saveBtnText}>{savingPersonal ? 'Guardando...' : 'Guardar datos'}</Text>
          </TouchableOpacity>
        </View>

        {/* Documentos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Documentos</Text>
          <Text style={styles.helper}>Formatos aceptados: JPG, PNG o PDF, hasta 5MB.</Text>
          {DOCUMENT_TYPES.map(({ type, label }) => {
            const doc = documentByType.get(type);
            const uploading = uploadingType === type;
            return (
              <View key={type} style={styles.docRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docLabel}>{label}</Text>
                  <Text style={doc ? styles.docStatusOk : styles.docStatusEmpty}>
                    {doc ? `Subido — ${doc.status === 'PENDING' ? 'en revisión' : doc.status === 'APPROVED' ? 'aprobado' : 'rechazado'}` : 'No subido'}
                  </Text>
                </View>
                {uploading ? (
                  <ActivityIndicator color="#2563eb" />
                ) : (
                  <View style={styles.docActions}>
                    <TouchableOpacity style={styles.docBtn} onPress={() => handleTakePhoto(type)}>
                      <Ionicons name="camera-outline" size={18} color="#2563eb" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.docBtn} onPress={() => handlePickFile(type)}>
                      <Ionicons name="folder-outline" size={18} color="#2563eb" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Vehículo */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehículo</Text>
          <Text style={styles.label}>Dominio</Text>
          <TextInput
            style={styles.input}
            value={vehicleForm.plate}
            onChangeText={(v) => setVehicleForm((f) => ({ ...f, plate: v }))}
            placeholder="AB123CD"
            autoCapitalize="characters"
          />
          <Text style={styles.label}>Tipo de vehículo</Text>
          <View style={styles.chipRow}>
            {VEHICLE_TYPES.map((v) => (
              <TouchableOpacity
                key={v.value}
                style={[styles.chip, vehicleForm.type === v.value && styles.chipActive]}
                onPress={() => setVehicleForm((f) => ({ ...f, type: v.value }))}
              >
                <Text style={[styles.chipText, vehicleForm.type === v.value && styles.chipTextActive]}>
                  {v.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Marca</Text>
          <TextInput
            style={styles.input}
            value={vehicleForm.brand}
            onChangeText={(v) => setVehicleForm((f) => ({ ...f, brand: v }))}
          />
          <Text style={styles.label}>Modelo</Text>
          <TextInput
            style={styles.input}
            value={vehicleForm.model}
            onChangeText={(v) => setVehicleForm((f) => ({ ...f, model: v }))}
          />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Año</Text>
              <TextInput
                style={styles.input}
                value={vehicleForm.year}
                onChangeText={(v) => setVehicleForm((f) => ({ ...f, year: v }))}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Capacidad (kg)</Text>
              <TextInput
                style={styles.input}
                value={vehicleForm.maxWeightKg}
                onChangeText={(v) => setVehicleForm((f) => ({ ...f, maxWeightKg: v }))}
                keyboardType="numeric"
              />
            </View>
          </View>
          <Text style={styles.label}>Volumen (m³, opcional)</Text>
          <TextInput
            style={styles.input}
            value={vehicleForm.maxVolumeM3}
            onChangeText={(v) => setVehicleForm((f) => ({ ...f, maxVolumeM3: v }))}
            keyboardType="numeric"
          />
          <View style={styles.row}>
            {(['refrigerated', 'hazardousMaterials', 'bulkLiquid'] as const).map((key) => (
              <TouchableOpacity
                key={key}
                style={[styles.chip, vehicleForm[key] && styles.chipActive, { flex: 1 }]}
                onPress={() => setVehicleForm((f) => ({ ...f, [key]: !f[key] }))}
              >
                <Text style={[styles.chipText, vehicleForm[key] && styles.chipTextActive]}>
                  {key === 'refrigerated' ? 'Refrigerado' : key === 'hazardousMaterials' ? 'Peligrosas' : 'A granel'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Vencimiento del seguro (opcional)</Text>
          <TextInput
            style={styles.input}
            value={vehicleForm.insuranceExpiresAt}
            onChangeText={(v) => setVehicleForm((f) => ({ ...f, insuranceExpiresAt: v }))}
            placeholder="AAAA-MM-DD"
          />
          <Text style={styles.label}>Vencimiento de la VTV (opcional)</Text>
          <TextInput
            style={styles.input}
            value={vehicleForm.vtvExpiresAt}
            onChangeText={(v) => setVehicleForm((f) => ({ ...f, vtvExpiresAt: v }))}
            placeholder="AAAA-MM-DD"
          />
          <TouchableOpacity
            style={[styles.saveBtn, savingVehicle && styles.btnDisabled]}
            onPress={handleSaveVehicle}
            disabled={savingVehicle}
          >
            <Text style={styles.saveBtnText}>{savingVehicle ? 'Guardando...' : 'Guardar vehículo'}</Text>
          </TouchableOpacity>
        </View>

        {/* Declaración jurada */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Declaración jurada</Text>
          {profile?.termsAcceptedAt ? (
            <Text style={styles.docStatusOk}>
              Aceptada el {new Date(profile.termsAcceptedAt).toLocaleDateString('es-AR')}.
            </Text>
          ) : (
            <>
              <Text style={styles.helper}>
                Declaro bajo juramento que la documentación que subí es auténtica, está vigente, y
                que acepto los Términos y Condiciones y la Política de Privacidad de CargoLink.
              </Text>
              <TouchableOpacity
                style={styles.checkRow}
                onPress={() => setTermsChecked((v) => !v)}
              >
                <Ionicons
                  name={termsChecked ? 'checkbox' : 'square-outline'}
                  size={22}
                  color="#2563eb"
                />
                <Text style={styles.checkText}>Leí y acepto la declaración jurada de arriba.</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, (!termsChecked || savingTerms) && styles.btnDisabled]}
                onPress={handleAcceptTerms}
                disabled={!termsChecked || savingTerms}
              >
                <Text style={styles.saveBtnText}>
                  {savingTerms ? 'Guardando...' : 'Aceptar declaración jurada'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statusCard: { borderRadius: 12, padding: 14, marginBottom: 12 },
  statusOk: { backgroundColor: '#dcfce7' },
  statusOkText: { color: '#15803d', fontWeight: '600' },
  statusWarn: { backgroundColor: '#fef3c7' },
  statusWarnTitle: { color: '#b45309', fontWeight: '600', marginBottom: 4 },
  statusWarnItem: { color: '#92400e', fontSize: 13 },
  section: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, gap: 6,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 4 },
  helper: { fontSize: 12, color: '#9ca3af', marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '500', color: '#6b7280', marginTop: 6 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15,
  },
  row: { flexDirection: 'row', gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 2, borderColor: '#e5e7eb', alignItems: 'center',
  },
  chipActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  chipTextActive: { color: '#2563eb' },
  saveBtn: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  btnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  docRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  docLabel: { fontSize: 13.5, fontWeight: '500', color: '#374151' },
  docStatusOk: { fontSize: 12, color: '#15803d', marginTop: 2 },
  docStatusEmpty: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  docActions: { flexDirection: 'row', gap: 8 },
  docBtn: {
    width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center',
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 4 },
  checkText: { flex: 1, fontSize: 13, color: '#374151' },
});
