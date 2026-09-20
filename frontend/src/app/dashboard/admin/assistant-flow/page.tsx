'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, ArrowUp, ArrowDown, CheckCircle } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { assistantApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface FlowStep {
  id: string;
  field: string;
  label: string;
  question: string;
  required: boolean;
  type: 'text' | 'number' | 'enum' | 'address' | 'date';
  help?: string;
  options?: string[];
}
interface FlowConfig {
  version: number;
  systemPreamble: string;
  greeting: string;
  steps: FlowStep[];
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm';

export default function AssistantFlowAdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [flow, setFlow] = useState<FlowConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Guard de rol en cliente (el backend igual exige ADMIN en el PUT).
  useEffect(() => {
    if (user && user.role !== 'ADMIN') router.replace('/');
  }, [user, router]);

  useEffect(() => {
    assistantApi
      .getFlow()
      .then((r) => setFlow(r.data.flow))
      .catch(() => setError('No se pudo cargar el flujo.'))
      .finally(() => setLoading(false));
  }, []);

  const updateStep = (index: number, patch: Partial<FlowStep>) => {
    setFlow((f) => {
      if (!f) return f;
      const steps = f.steps.map((s, i) => (i === index ? { ...s, ...patch } : s));
      return { ...f, steps };
    });
    setSaved(false);
  };

  const move = (index: number, dir: -1 | 1) => {
    setFlow((f) => {
      if (!f) return f;
      const target = index + dir;
      if (target < 0 || target >= f.steps.length) return f;
      const steps = [...f.steps];
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...f, steps };
    });
    setSaved(false);
  };

  const save = async () => {
    if (!flow) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const r = await assistantApi.updateFlow(flow);
      setFlow(r.data);
      setSaved(true);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'No se pudo guardar el flujo.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center gap-2 text-ink-500">
          <Loader2 className="animate-spin" size={18} /> Cargando flujo…
        </div>
      </DashboardLayout>
    );
  }
  if (!flow) {
    return (
      <DashboardLayout>
        <div className="text-red-600">{error || 'No hay flujo disponible.'}</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold">Flujo del asistente</h1>
            <p className="text-sm text-ink-500 mt-1">
              Editá cómo el chatbot pregunta los datos para crear una carga.
            </p>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="bg-primary-600 hover:bg-primary-700 text-white font-medium px-4 py-2 rounded-lg transition disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar
          </button>
        </div>

        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}
        {saved && (
          <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm flex items-center gap-2">
            <CheckCircle size={16} /> Flujo guardado.
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Saludo inicial</label>
            <textarea
              value={flow.greeting}
              onChange={(e) => { setFlow({ ...flow, greeting: e.target.value }); setSaved(false); }}
              rows={2}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Instrucción de sistema (tono y reglas del asistente)
            </label>
            <textarea
              value={flow.systemPreamble}
              onChange={(e) => { setFlow({ ...flow, systemPreamble: e.target.value }); setSaved(false); }}
              rows={4}
              className={inputClass}
            />
          </div>
        </div>

        <h2 className="font-semibold text-gray-700 mb-3">Pasos ({flow.steps.length})</h2>
        <div className="space-y-4">
          {flow.steps.map((step, i) => (
            <div key={step.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                    {step.field} · {step.type}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Subir">
                    <ArrowUp size={16} />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === flow.steps.length - 1} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Bajar">
                    <ArrowDown size={16} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Etiqueta (panel)</label>
                  <input value={step.label} onChange={(e) => updateStep(i, { label: e.target.value })} className={inputClass} />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={step.required} onChange={(e) => updateStep(i, { required: e.target.checked })} className="rounded" />
                    Obligatorio
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Pregunta</label>
                <textarea value={step.question} onChange={(e) => updateStep(i, { question: e.target.value })} rows={2} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Ayuda (opcional)</label>
                <input value={step.help ?? ''} onChange={(e) => updateStep(i, { help: e.target.value })} className={inputClass} />
              </div>
              {step.type === 'enum' && step.options && (
                <p className="text-xs text-gray-400">Opciones fijas: {step.options.join(' · ')}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
