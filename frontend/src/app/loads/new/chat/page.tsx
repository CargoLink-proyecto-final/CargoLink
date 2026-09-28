'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Send, Loader2, Bot, User as UserIcon, CheckCircle, AlertTriangle, FileText } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { assistantApi, loadsApi } from '@/lib/api';
import { geocodeStructured, geocodeAddress } from '@/lib/routing';

// Espejo de los tipos del backend (loads-assistant). Se mantienen acá para no
// acoplar el front a imports del backend.
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
interface AddressDraft {
  address?: string;
  city?: string;
  province?: string;
}
interface LoadDraft {
  title?: string;
  description?: string;
  cargoType?: string;
  weight?: number;
  volume?: number;
  price?: number;
  origin?: AddressDraft;
  dest?: AddressDraft;
  pickupDate?: string;
  deliveryDate?: string;
}
interface AssistantTurn {
  assistantMessage: string;
  draft: LoadDraft;
  missing: string[];
  readyToConfirm: boolean;
  // El backend resolvió el turno en modo básico (sin IA disponible).
  degraded: boolean;
}
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function formatAddr(a?: AddressDraft): string {
  if (!a) return '';
  return [a.address, a.city, a.province].filter(Boolean).join(', ');
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

// Cómo se muestra cada campo del borrador en el panel lateral.
function draftValue(step: FlowStep, draft: LoadDraft): string {
  switch (step.type) {
    case 'address':
      return formatAddr(draft[step.field as 'origin' | 'dest']);
    case 'date':
      return formatDate(draft[step.field as 'pickupDate' | 'deliveryDate']);
    default: {
      const v = (draft as Record<string, unknown>)[step.field];
      return v == null || v === '' ? '' : String(v);
    }
  }
}

export default function ChatLoadPage() {
  const router = useRouter();
  const [flow, setFlow] = useState<FlowConfig | null>(null);
  // Sin ningún proveedor de LLM configurado el asistente igual funciona, pero
  // en modo básico: pregunta de a un dato por vez y parsea con reglas.
  const [basicMode, setBasicMode] = useState(false);
  const [loadingFlow, setLoadingFlow] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<LoadDraft>({});
  const [readyToConfirm, setReadyToConfirm] = useState(false);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Carga el flujo editable (saludo + pasos) al abrir.
  useEffect(() => {
    assistantApi
      .getFlow()
      .then((r) => {
        const cfg: FlowConfig = r.data.flow;
        setFlow(cfg);
        setBasicMode(!!r.data.basicMode);
        setMessages([{ role: 'assistant', content: cfg.greeting }]);
      })
      .catch(() => setError('No se pudo cargar el asistente.'))
      .finally(() => setLoadingFlow(false));
  }, []);

  // Autoscroll al último mensaje.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const send = async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setError('');
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setThinking(true);
    try {
      // El backend es stateless: le mandamos el historial + el borrador acumulado.
      const r = await assistantApi.sendMessage({ messages: next, draft });
      const turn: AssistantTurn = r.data;
      setMessages([...next, { role: 'assistant', content: turn.assistantMessage }]);
      setDraft(turn.draft);
      setReadyToConfirm(turn.readyToConfirm);
      setBasicMode(turn.degraded);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'El asistente no pudo responder. Probá de nuevo.');
    } finally {
      setThinking(false);
    }
  };

  // Geocodifica una dirección del borrador reutilizando lib/routing.ts.
  const resolveCoords = async (a?: AddressDraft) => {
    if (!a) return null;
    const structured = await geocodeStructured({ street: a.address, city: a.city, state: a.province });
    if (structured) return { lat: structured.lat, lng: structured.lng };
    const free = await geocodeAddress(formatAddr(a));
    return free ? { lat: free.lat, lng: free.lng } : null;
  };

  const confirmCreate = async () => {
    setCreating(true);
    setError('');
    try {
      const origin = await resolveCoords(draft.origin);
      if (!origin) {
        setError('No pude ubicar el origen en el mapa. Aclará mejor la dirección en el chat.');
        return;
      }
      const dest = await resolveCoords(draft.dest);
      if (!dest) {
        setError('No pude ubicar el destino en el mapa. Aclará mejor la dirección en el chat.');
        return;
      }
      await loadsApi.create({
        title: draft.title,
        description: draft.description,
        cargoType: draft.cargoType,
        weight: draft.weight ? Number(draft.weight) : undefined,
        price: draft.price ? Number(draft.price) : undefined,
        pickupDate: draft.pickupDate,
        deliveryDate: draft.deliveryDate,
        originAddress: formatAddr(draft.origin),
        originLat: origin.lat,
        originLng: origin.lng,
        destAddress: formatAddr(draft.dest),
        destLat: dest.lat,
        destLng: dest.lng,
        // No mandamos cityId: lo resuelve el backfill del backend por dirección
        // y coordenadas (ver memoria del proyecto).
      });
      router.push('/dashboard/shipper');
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'No se pudo crear la carga. Revisá los datos.');
    } finally {
      setCreating(false);
    }
  };

  if (loadingFlow) {
    return (
      <DashboardLayout>
        <div className="flex items-center gap-2 text-ink-500">
          <Loader2 className="animate-spin" size={18} /> Cargando asistente…
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Crear carga con asistente</h1>
            <p className="text-sm text-ink-500 mt-1">Contale a Cargo qué querés transportar y se arma sola.</p>
          </div>
          <Link href="/loads/new" className="text-sm text-primary-700 hover:underline">
            Usar formulario tradicional
          </Link>
        </div>

        {basicMode && (
          <div className="bg-amber-50 text-amber-700 p-3 rounded-lg mb-4 text-sm flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              El asistente está en <strong>modo básico</strong>: la IA no está disponible en este
              momento, así que te voy a ir preguntando los datos de a uno. Podés seguir acá o usar el{' '}
              <Link href="/loads/new" className="underline">
                formulario tradicional
              </Link>
              .
            </span>
          </div>
        )}
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chat */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-[70vh]">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center shrink-0">
                      <Bot size={16} />
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-primary-600 text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    }`}
                  >
                    {m.content}
                  </div>
                  {m.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center shrink-0">
                      <UserIcon size={16} />
                    </div>
                  )}
                </div>
              ))}
              {thinking && (
                <div className="flex gap-2 justify-start">
                  <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center shrink-0">
                    <Bot size={16} />
                  </div>
                  <div className="bg-gray-100 text-gray-500 px-4 py-2 rounded-2xl rounded-bl-sm text-sm flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> escribiendo…
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 p-3">
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  disabled={thinking}
                  rows={1}
                  placeholder="Escribí tu mensaje…"
                  className="flex-1 resize-none px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm"
                />
                <button
                  onClick={send}
                  disabled={thinking || !input.trim()}
                  className="bg-primary-600 hover:bg-primary-700 text-white px-4 rounded-lg transition disabled:opacity-50 flex items-center"
                  aria-label="Enviar"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Panel de borrador en vivo */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-fit lg:sticky lg:top-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={16} className="text-primary-700" />
              <h2 className="font-semibold text-gray-700">Resumen de la carga</h2>
            </div>
            <dl className="space-y-3">
              {flow?.steps.map((step) => {
                const value = draftValue(step, draft);
                const filled = value !== '';
                return (
                  <div key={step.id} className="text-sm">
                    <dt className="flex items-center gap-1.5 text-gray-500">
                      {filled ? (
                        <CheckCircle size={14} className="text-green-600 shrink-0" />
                      ) : (
                        <span className="w-3.5 h-3.5 rounded-full border border-gray-300 shrink-0" />
                      )}
                      {step.label}
                      {step.required && !filled && <span className="text-red-400 text-xs">*</span>}
                    </dt>
                    <dd className={`pl-5 ${filled ? 'text-gray-800' : 'text-gray-400'}`}>
                      {filled ? value : 'Pendiente'}
                    </dd>
                  </div>
                );
              })}
            </dl>

            <button
              onClick={confirmCreate}
              disabled={!readyToConfirm || creating}
              className="mt-5 w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2.5 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {creating ? 'Creando…' : 'Crear carga'}
            </button>
            {!readyToConfirm && (
              <p className="text-xs text-gray-400 mt-2 text-center">
                Completá los datos obligatorios en el chat para habilitar la creación.
              </p>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
