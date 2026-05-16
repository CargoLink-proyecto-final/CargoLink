'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { ArrowRight, Truck } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [error, setError] = useState('');
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setError('');
    setUnverifiedEmail(null);
    setResendStatus('idle');
    setLoading(true);
    try {
      const res = await authApi.login(data);
      login(res.data.user, res.data.accessToken);
      router.push('/');
    } catch (err: any) {
      const body = err.response?.data;
      if (body?.code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(body.email || data.email);
        setError(body.message || 'Tenés que verificar tu correo electrónico antes de iniciar sesión.');
      } else {
        setError(body?.message || 'Error al iniciar sesión');
      }
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    if (!unverifiedEmail) return;
    setResendStatus('sending');
    try {
      await authApi.resendVerification(unverifiedEmail);
    } finally {
      setResendStatus('sent');
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col lg:flex-row">
      {/* Left — editorial visual side */}
      <aside className="relative lg:w-[46%] bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 text-surface-raised overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-40"
             style={{
               backgroundImage:
                 'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.18), transparent 45%), radial-gradient(circle at 80% 80%, rgba(0,0,0,0.25), transparent 50%)',
             }}
        />
        {/* Hatched cargo lines decoration */}
        <svg className="absolute right-[-60px] top-[40%] opacity-10" width="320" height="320" viewBox="0 0 320 320">
          {Array.from({ length: 28 }).map((_, i) => (
            <line key={i} x1={i * 12} y1="0" x2={i * 12 + 120} y2="320" stroke="white" strokeWidth="1" />
          ))}
        </svg>

        <div className="relative z-10 h-full flex flex-col justify-between px-10 lg:px-14 py-10 lg:py-14 min-h-[40vh] lg:min-h-screen">
          <div>
            <Link href="/" className="inline-flex items-center gap-2">
              <span className="font-display font-semibold text-[32px] leading-none text-surface-raised tracking-tight">
                CargoLink
              </span>
            </Link>
            <p className="eyebrow mt-3 text-primary-200">Plataforma de transporte terrestre</p>
          </div>

          <div className="max-w-md">
            <p className="font-display font-medium text-[40px] lg:text-[52px] leading-[1.05] text-surface-raised tracking-tight">
              Mover carga,<br/>
              <span className="font-semibold text-accent-300">claro como un manifiesto.</span>
            </p>
            <p className="mt-6 text-[15px] text-primary-100 leading-relaxed max-w-sm">
              Conectá generadores y transportistas en una sola vista — publicación, ruta, conversación y entrega.
            </p>
          </div>

          <div className="flex items-center gap-4 text-[11px] uppercase tracking-[0.22em] text-primary-200">
            <Truck size={14} className="text-accent-300" />
            <span>Manifiesto N.º 2026 · {new Date().toLocaleDateString('es-AR')}</span>
          </div>
        </div>
      </aside>

      {/* Right — form */}
      <section className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <p className="eyebrow">Acceso</p>
            <h1 className="mt-2 font-display text-[34px] leading-tight">
              Iniciá <span className="font-semibold text-primary-700">sesión</span>
            </h1>
            <p className="text-ink-500 mt-2 text-[14px]">
              Bienvenido de vuelta. Ingresá con tu correo registrado.
            </p>
          </div>

          {error && (
            <div className="bg-danger-50 border border-danger-600/15 text-danger-700 p-3.5 rounded-lg mb-5 text-sm">
              <p>{error}</p>
              {unverifiedEmail && (
                <button
                  type="button"
                  onClick={resendVerification}
                  disabled={resendStatus !== 'idle'}
                  className="mt-2 text-xs font-medium underline disabled:opacity-60"
                >
                  {resendStatus === 'sending'
                    ? 'Enviando…'
                    : resendStatus === 'sent'
                      ? 'Correo enviado — revisá tu bandeja'
                      : 'Reenviar correo de verificación'}
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-[12px] font-medium text-ink-700 mb-1.5 tracking-wide">
                Correo electrónico
              </label>
              <input
                type="email"
                {...register('email', { required: 'El correo electrónico es obligatorio' })}
                className="w-full px-4 py-2.5 bg-surface-raised border border-ink-200 rounded-lg text-[14px] focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 outline-none transition"
                placeholder="tu@empresa.com"
              />
              {errors.email && <p className="text-danger-600 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[12px] font-medium text-ink-700 tracking-wide">
                  Contraseña
                </label>
                <Link href="/auth/forgot-password" className="text-[11px] text-primary-700 hover:text-primary-800 hover:underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <input
                type="password"
                {...register('password', { required: 'La contraseña es obligatoria', minLength: { value: 6, message: 'Mínimo 6 caracteres' } })}
                className="w-full px-4 py-2.5 bg-surface-raised border border-ink-200 rounded-lg text-[14px] focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 outline-none transition"
                placeholder="••••••••"
              />
              {errors.password && <p className="text-danger-600 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group w-full bg-ink-900 hover:bg-ink-800 text-surface-raised font-medium py-3 rounded-lg transition disabled:opacity-50 inline-flex items-center justify-center gap-2 text-[14px]"
            >
              {loading ? 'Iniciando sesión…' : (
                <>
                  Iniciar sesión
                  <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <div className="my-7 flex items-center gap-3">
            <div className="flex-1 h-px bg-ink-200" />
            <span className="text-[10px] uppercase tracking-[0.22em] text-ink-400">o</span>
            <div className="flex-1 h-px bg-ink-200" />
          </div>

          <p className="text-center text-sm text-ink-500">
            ¿Aún no tenés cuenta?{' '}
            <Link href="/auth/register" className="text-primary-700 hover:text-primary-800 font-medium hover:underline">
              Creá una nueva
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
