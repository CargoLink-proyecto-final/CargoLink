'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { ArrowRight, CheckCircle } from 'lucide-react';
import { authApi } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<{ email: string }>();

  const onSubmit = async (data: { email: string }) => {
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword(data.email);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Algo salió mal. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <Link href="/auth/login" className="font-display font-semibold text-[24px] text-ink-900">
            CargoLink
          </Link>
          <p className="eyebrow mt-4">Recuperación</p>
          <h1 className="mt-2 font-display text-[34px] leading-tight">
            ¿Olvidaste tu <span className="font-semibold text-primary-700">contraseña?</span>
          </h1>
          <p className="text-ink-500 mt-2 text-[14px]">
            Ingresá tu correo y te enviamos un enlace para restablecerla.
          </p>
        </div>

        {submitted ? (
          <div className="bg-success-50 border border-success-600/15 rounded-xl p-6 text-center">
            <CheckCircle size={40} className="text-success-600 mx-auto mb-3" />
            <p className="font-medium text-success-700 text-[15px]">Correo enviado</p>
            <p className="text-success-600 text-sm mt-1">
              Si existe una cuenta con ese correo, vas a recibir el enlace en breve.
            </p>
            <Link
              href="/auth/login"
              className="mt-5 inline-block text-primary-700 hover:text-primary-800 font-medium text-sm hover:underline"
            >
              Volver al inicio de sesión
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-danger-50 border border-danger-600/15 text-danger-700 p-3.5 rounded-lg mb-5 text-sm">
                {error}
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

              <button
                type="submit"
                disabled={loading}
                className="group w-full bg-ink-900 hover:bg-ink-800 text-surface-raised font-medium py-3 rounded-lg transition disabled:opacity-50 inline-flex items-center justify-center gap-2 text-[14px]"
              >
                {loading ? 'Enviando…' : (
                  <>
                    Enviar enlace
                    <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>
          </>
        )}

        <p className="text-center text-sm text-ink-500 mt-7">
          <Link href="/auth/login" className="text-primary-700 hover:text-primary-800 font-medium hover:underline">
            Volver al inicio de sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
