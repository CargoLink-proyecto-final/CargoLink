import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ratingsApi } from '../../services/api';

export default function RatingScreen({ route, navigation }: any) {
  const { tripId } = route.params;
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await ratingsApi.create({ tripId, score, comment: comment.trim() || undefined });
      Alert.alert('¡Gracias!', 'Tu calificación ha sido enviada.');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Error al enviar la calificación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Calificar este viaje</Text>
      <Text style={styles.subtitle}>¿Cómo fue tu experiencia?</Text>

      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((s) => (
          <TouchableOpacity key={s} onPress={() => setScore(s)}>
            <Ionicons
              name={s <= score ? 'star' : 'star-outline'}
              size={44}
              color={s <= score ? '#f59e0b' : '#d1d5db'}
            />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.scoreText}>
        {score === 1 ? 'Malo' : score === 2 ? 'Regular' : score === 3 ? 'Bueno' : score === 4 ? 'Muy Bueno' : 'Excelente'}
      </Text>

      <TextInput
        style={styles.input}
        value={comment}
        onChangeText={setComment}
        placeholder="Deja un comentario (opcional)"
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      <TouchableOpacity
        style={[styles.button, loading && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? 'Enviando...' : 'Enviar Calificación'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.skipText}>Omitir por ahora</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', marginTop: 8, marginBottom: 24 },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
  scoreText: { textAlign: 'center', fontSize: 16, fontWeight: '600', color: '#f59e0b', marginBottom: 24 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, padding: 14,
    fontSize: 15, minHeight: 100, marginBottom: 20,
  },
  button: {
    backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 16, alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  skipBtn: { paddingVertical: 16, alignItems: 'center' },
  skipText: { color: '#6b7280', fontSize: 14 },
});
