'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { usersApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Search, Shield, UserCheck, UserX } from 'lucide-react';

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', roleFilter, page],
    queryFn: () => usersApi.getAll({ role: roleFilter || undefined, page, limit: 20 }).then((r) => r.data),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => usersApi.toggleActive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const users = (data?.users || []).filter((u: any) =>
    !search ||
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const roleColors: Record<string, string> = {
    CARGO_GENERATOR: 'bg-blue-100 text-blue-700',
    TRANSPORTER: 'bg-orange-100 text-orange-700',
    ADMIN: 'bg-purple-100 text-purple-700',
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield size={24} /> Gestión de Usuarios</h1>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar usuarios..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          >
            <option value="">Todos los Roles</option>
            <option value="CARGO_GENERATOR">Generador de carga</option>
            <option value="TRANSPORTER">Transportista</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-gray-400">Cargando...</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-left">
                    <tr>
                      <th className="px-4 py-3 font-medium">Usuario</th>
                      <th className="px-4 py-3 font-medium">Correo</th>
                      <th className="px-4 py-3 font-medium">Rol</th>
                      <th className="px-4 py-3 font-medium">Empresa</th>
                      <th className="px-4 py-3 font-medium">Registro</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                      <th className="px-4 py-3 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {users.map((u: any) => (
                      <tr key={u.id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 font-medium">{u.firstName} {u.lastName}</td>
                        <td className="px-4 py-3 text-gray-600">{u.email}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${roleColors[u.role]}`}>{u.role}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{u.companyName || '-'}</td>
                        <td className="px-4 py-3 text-gray-500">{formatDate(u.createdAt)}</td>
                        <td className="px-4 py-3">
                          <span className={`flex items-center gap-1 text-xs ${u.isActive ? 'text-green-600' : 'text-red-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${u.isActive ? 'bg-green-400' : 'bg-red-400'}`} />
                            {u.isActive ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleMutation.mutate(u.id)}
                            disabled={toggleMutation.isPending}
                            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition ${
                              u.isActive
                                ? 'text-red-600 hover:bg-red-50'
                                : 'text-green-600 hover:bg-green-50'
                            }`}
                          >
                            {u.isActive ? <><UserX size={14} /> Desactivar</> : <><UserCheck size={14} /> Activar</>}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {data?.totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-gray-100">
                  <span className="text-sm text-gray-500">Página {data.page} de {data.totalPages}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50">Anterior</button>
                    <button onClick={() => setPage((p) => p + 1)} disabled={page >= data.totalPages} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50">Siguiente</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
