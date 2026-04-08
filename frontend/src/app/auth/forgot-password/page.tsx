'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
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
      setError(err.response?.data?.message || 'Algo salió mal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 to-primary-900 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-700">CargoLink</h1>
          <p className="text-gray-500 mt-2">Restablecer tu contraseña</p>
        </div>

        {submitted ? (
          <div className="text-center">
            <div className="bg-green-50 text-green-700 p-4 rounded-lg mb-4">
              Si existe una cuenta con ese correo, se ha enviado un enlace para restablecer la contraseña.
            </div>
            <Link href="/auth/login" className="text-primary-600 hover:underline font-medium">
              Volver al inicio de sesión
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>
            )}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
                <input
                  type="email"
                  {...register('email', { required: 'El correo electrónico es obligatorio' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  placeholder="tu@ejemplo.com"
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2.5 rounded-lg transition disabled:opacity-50"
              >
                {loading ? 'Enviando...' : 'Enviar Enlace'}
              </button>
            </form>
            <p className="text-center text-sm text-gray-500 mt-6">
              <Link href="/auth/login" className="text-primary-600 hover:underline font-medium">
                Volver al inicio de sesión
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
