'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface RegisterForm {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: 'CARGO_GENERATOR' | 'TRANSPORTER';
  companyName?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<RegisterForm>({
    defaultValues: { role: 'CARGO_GENERATOR' },
  });

  const selectedRole = watch('role');

  const onSubmit = async (data: RegisterForm) => {
    setError('');
    setLoading(true);
    try {
      const res = await authApi.register(data);
      login(res.data.user, res.data.accessToken);
      router.push('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error en el registro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 to-primary-900 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-700">CargoLink</h1>
          <p className="text-gray-500 mt-2">Creá tu cuenta</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="flex gap-2">
            <label className={`flex-1 text-center py-2 rounded-lg border-2 cursor-pointer transition ${selectedRole === 'CARGO_GENERATOR' ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-200'}`}>
              <input type="radio" value="CARGO_GENERATOR" {...register('role')} className="sr-only" />
              Generador de carga
            </label>
            <label className={`flex-1 text-center py-2 rounded-lg border-2 cursor-pointer transition ${selectedRole === 'TRANSPORTER' ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-200'}`}>
              <input type="radio" value="TRANSPORTER" {...register('role')} className="sr-only" />
              Transportista
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                {...register('firstName', { required: 'Obligatorio' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
              {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Apellido</label>
              <input
                {...register('lastName', { required: 'Obligatorio' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
              {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
            <input
              type="email"
              {...register('email', { required: 'El correo electrónico es obligatorio' })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input
              type="password"
              {...register('password', { required: 'La contraseña es obligatoria', minLength: { value: 6, message: 'Mínimo 6 caracteres' } })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
            <input
              {...register('phone', { required: 'El teléfono es obligatorio' })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Empresa (opcional)</label>
            <input
              {...register('companyName')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2.5 rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'Creando cuenta...' : 'Registrarse'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          ¿Ya tienes una cuenta?{' '}
          <Link href="/auth/login" className="text-primary-600 hover:underline font-medium">
            Iniciar Sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
