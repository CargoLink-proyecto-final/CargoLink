'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

type Status = 'verifying' | 'success' | 'error';

function VerifyEmailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const [status, setStatus] = useState<Status>('verifying');
  const [error, setError] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setStatus('error');
      setError('Falta el token de verificación en el enlace.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await authApi.verifyEmail(token);
        if (cancelled) return;
        login(res.data.user, res.data.accessToken);
        setStatus('success');
        setTimeout(() => router.push('/'), 1500);
      } catch (err: any) {
        if (cancelled) return;
        setStatus('error');
        setError(err.response?.data?.message || 'Enlace inválido o expirado.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params, login, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 to-primary-900 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
        <h1 className="text-3xl font-bold text-primary-700">CargoLink</h1>

        {status === 'verifying' && (
          <>
            <h2 className="text-xl font-semibold mt-6">Verificando…</h2>
            <div className="mt-6 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <h2 className="text-xl font-semibold mt-6 text-green-700">¡Cuenta verificada!</h2>
            <p className="text-gray-600 mt-3 text-sm">Te estamos redirigiendo al panel...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <h2 className="text-xl font-semibold mt-6 text-red-700">No pudimos verificar tu cuenta</h2>
            <p className="text-gray-600 mt-3 text-sm">{error}</p>
            <p className="text-sm text-gray-500 mt-6">
              <Link href="/auth/login" className="text-primary-600 hover:underline font-medium">
                Ir al inicio de sesión
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
