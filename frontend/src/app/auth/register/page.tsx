'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff } from 'lucide-react';
import { authApi } from '@/lib/api';

interface RegisterForm {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: 'CARGO_GENERATOR' | 'TRANSPORTER' | 'COMPANY_ADMIN';
  companyName?: string;
  industry?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<RegisterForm>({
    defaultValues: { role: 'CARGO_GENERATOR' },
    // Los campos ocultos (nombre/apellido cuando el rol es Empresa) se
    // desregistran al desmontarse, así no se validan ni se envían.
    shouldUnregister: true,
  });

  const selectedRole = watch('role');
  const passwordValue = watch('password');

  const onSubmit = async (data: RegisterForm) => {
    setError('');
    setLoading(true);
    try {
      const { confirmPassword: _, ...submitData } = data;
      await authApi.register(submitData);
      router.push(`/auth/check-email?email=${encodeURIComponent(data.email)}`);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Error en el registro');
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
          <div className="grid grid-cols-3 gap-2">
            <label className={`text-center py-2 px-1 rounded-lg border-2 cursor-pointer transition text-xs font-medium ${selectedRole === 'CARGO_GENERATOR' ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600'}`}>
              <input type="radio" value="CARGO_GENERATOR" {...register('role')} className="sr-only" />
              Publicador de carga
            </label>
            <label className={`text-center py-2 px-1 rounded-lg border-2 cursor-pointer transition text-xs font-medium ${selectedRole === 'TRANSPORTER' ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600'}`}>
              <input type="radio" value="TRANSPORTER" {...register('role')} className="sr-only" />
              Transportista
            </label>
            <label className={`text-center py-2 px-1 rounded-lg border-2 cursor-pointer transition text-xs font-medium ${selectedRole === 'COMPANY_ADMIN' ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600'}`}>
              <input type="radio" value="COMPANY_ADMIN" {...register('role')} className="sr-only" />
              Empresa
            </label>
          </div>

          {selectedRole !== 'COMPANY_ADMIN' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre <span className="text-red-500">*</span></label>
                <input
                  {...register('firstName', {
                  required: 'Obligatorio',
                  pattern: { value: /^[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s]+$/, message: 'Solo letras' },
                })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                />
                {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Apellido <span className="text-red-500">*</span></label>
                <input
                  {...register('lastName', {
                  required: 'Obligatorio',
                  pattern: { value: /^[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s]+$/, message: 'Solo letras' },
                })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                />
                {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico <span className="text-red-500">*</span></label>
            <input
              type="email"
              {...register('email', { required: 'El correo electrónico es obligatorio' })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña <span className="text-red-500">*</span></label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                {...register('password', {
                  required: 'La contraseña es obligatoria',
                  validate: (value) => {
                    if (!value) return true;
                    if (value.length < 8) return 'Mínimo 8 caracteres';
                    if (!/[a-zA-Z]/.test(value)) return 'Debe contener al menos una letra';
                    if (!/[0-9]/.test(value)) return 'Debe contener al menos un número';
                    return true;
                  },
                })}
                className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Repetir contraseña <span className="text-red-500">*</span></label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                {...register('confirmPassword', {
                  required: 'Repetí la contraseña',
                  validate: (value) => value === passwordValue || 'Las contraseñas no coinciden',
                })}
                className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono <span className="text-red-500">*</span></label>
            <input
              type="tel"
              placeholder="+54 9 351 123 4567"
              {...register('phone', {
                required: 'El teléfono es obligatorio',
                pattern: {
                  value: /^\+?[\d\s\-().]{7,20}$/,
                  message: 'Formato inválido. Ej: +54 9 351 123 4567',
                },
              })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
          </div>

          {/* El transportista no elige empresa al registrarse: lo hace después
              desde "Mi Empresa" (solicitud + aprobación del admin de la flota). */}
          {selectedRole !== 'TRANSPORTER' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {selectedRole === 'COMPANY_ADMIN' ? (
                  <>Nombre de la empresa <span className="text-red-500">*</span></>
                ) : (
                  'Empresa (opcional)'
                )}
              </label>
              <input
                {...register('companyName', {
                  validate: (value) =>
                    selectedRole !== 'COMPANY_ADMIN' ||
                    (!!value && value.trim().length > 0) ||
                    'El nombre de la empresa es obligatorio',
                })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
              {selectedRole === 'COMPANY_ADMIN' && (
                <p className="text-xs text-gray-500 mt-1">
                  Vas a administrar esta empresa: los transportistas podrán pedir unirse a tu flota.
                </p>
              )}
              {errors.companyName && (
                <p className="text-red-500 text-xs mt-1">{errors.companyName.message}</p>
              )}
            </div>
          )}

          {selectedRole === 'CARGO_GENERATOR' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rubro (opcional)</label>
              <input
                {...register('industry')}
                placeholder="Ej., Agroindustria, Construcción, Retail"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">Tu rubro o actividad da contexto a los transportistas.</p>
            </div>
          )}

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
