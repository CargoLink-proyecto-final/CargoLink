'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api';

function CheckEmailInner() {
  const params = useSearchParams();
  const email = params.get('email') ?? '';
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const resend = async () => {
    if (!email) return;
    setStatus('sending');
    setMessage('');
    try {
      const res = await authApi.resendVerification(email);
      setStatus('sent');
      setMessage(res.data?.message || 'Si existe una cuenta sin verificar, te enviamos un nuevo enlace.');
    } catch (err: any) {
      setStatus('error');
      setMessage(err.response?.data?.message || 'No pudimos reenviar el correo. Intentá más tarde.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 to-primary-900 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
        <h1 className="text-3xl font-bold text-primary-700">CargoLink</h1>
        <h2 className="text-xl font-semibold mt-6">Revisá tu correo</h2>
        <p className="text-gray-600 mt-3 text-sm">
          Te enviamos un enlace de verificación
          {email && (
            <>
              {' '}a <span className="font-medium text-gray-800">{email}</span>
            </>
          )}
          . Hacé clic en el enlace para activar tu cuenta.
        </p>
        <p className="text-gray-500 mt-3 text-xs">
          El enlace expira en 24 horas. Si no lo recibís, revisá tu carpeta de spam o reenvialo abajo.
        </p>

        {message && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${status === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
            {message}
          </div>
        )}

        <button
          type="button"
          onClick={resend}
          disabled={!email || status === 'sending'}
          className="mt-6 w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2.5 rounded-lg transition disabled:opacity-50"
        >
          {status === 'sending' ? 'Enviando...' : 'Reenviar correo de verificación'}
        </button>

        <p className="text-sm text-gray-500 mt-6">
          <Link href="/auth/login" className="text-primary-600 hover:underline font-medium">
            Volver al inicio de sesión
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={null}>
      <CheckEmailInner />
    </Suspense>
  );
}
