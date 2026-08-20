'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { usersApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { formatDate } from '@/lib/utils';
import { Search, Shield, UserCheck, UserX, History, AlertTriangle, Mail } from 'lucide-react';
import type { Role, RoleChangeLog } from '@/types';

const ROLE_LABEL: Record<string, string> = {
  CARGO_GENERATOR: 'Publicador de carga',
  TRANSPORTER: 'Transportista',
  ADMIN: 'Administrador',
  COMPANY_ADMIN: 'Administrador de empresa',
};

// Roles asignables desde el panel (COMPANY_ADMIN se gestiona desde el flujo de empresas).
const ASSIGNABLE_ROLES: Role[] = ['CARGO_GENERATOR', 'TRANSPORTER', 'ADMIN'];

const roleColors: Record<string, string> = {
  CARGO_GENERATOR: 'bg-blue-100 text-blue-700',
  TRANSPORTER: 'bg-orange-100 text-orange-700',
  ADMIN: 'bg-purple-100 text-purple-700',
  COMPANY_ADMIN: 'bg-emerald-100 text-emerald-700',
};

type DeactivateTarget = { user: any } | null;
type RoleTarget = { user: any; role: Role } | null;

export default function UsersPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState('');

  const [deactivateTarget, setDeactivateTarget] = useState<DeactivateTarget>(null);
  const [roleTarget, setRoleTarget] = useState<RoleTarget>(null);
  const [historyUser, setHistoryUser] = useState<any>(null);
  const [emailTarget, setEmailTarget] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', roleFilter, page],
    queryFn: () =>
      usersApi.getAll({ role: roleFilter || undefined, page, limit: 20 }).then((r) => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => usersApi.deactivateUser(id),
    onSuccess: () => {
      invalidate();
      setDeactivateTarget(null);
    },
    onError: (err: any) => {
      setActionError(err.response?.data?.message || 'No se pudo desactivar la cuenta');
      setDeactivateTarget(null);
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => usersApi.reactivateUser(id),
    onSuccess: invalidate,
    onError: (err: any) =>
      setActionError(err.response?.data?.message || 'No se pudo reactivar la cuenta'),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => usersApi.changeUserRole(id, role),
    onSuccess: () => {
      invalidate();
      setRoleTarget(null);
    },
    onError: (err: any) => {
      setActionError(err.response?.data?.message || 'No se pudo cambiar el rol');
      setRoleTarget(null);
    },
  });

  const emailMutation = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) => usersApi.changeUserEmail(id, email),
    onSuccess: () => {
      invalidate();
      setEmailTarget(null);
    },
    onError: (err: any) => {
      setActionError(err.response?.data?.message || 'No se pudo cambiar el correo');
      setEmailTarget(null);
    },
  });

  const users = (data?.users || []).filter(
    (u: any) =>
      !search ||
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield size={24} /> Gestión de Usuarios
          </h1>
        </div>

        {actionError && (
          <div className="bg-danger-50 border border-danger-600/15 text-danger-700 p-3 rounded-lg text-sm flex items-start justify-between gap-3">
            <span>{actionError}</span>
            <button onClick={() => setActionError('')} className="text-xs underline shrink-0">
              cerrar
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar usuarios..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          >
            <option value="">Todos los Roles</option>
            <option value="CARGO_GENERATOR">Publicador de carga</option>
            <option value="TRANSPORTER">Transportista</option>
            <option value="ADMIN">Admin</option>
            <option value="COMPANY_ADMIN">Administrador de empresa</option>
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
                      <th className="px-4 py-3 font-medium hidden md:table-cell">Empresa</th>
                      <th className="px-4 py-3 font-medium hidden md:table-cell">Registro</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                      <th className="px-4 py-3 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {users.map((u: any) => {
                      const isSelf = u.id === currentUser?.id;
                      const roleLocked = u.role === 'COMPANY_ADMIN' || isSelf;
                      return (
                        <tr key={u.id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-3 font-medium">
                            {u.firstName} {u.lastName}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{u.email}</td>
                          <td className="px-4 py-3">
                            {roleLocked ? (
                              <span
                                className={`text-xs px-2 py-1 rounded-full ${roleColors[u.role] ?? 'bg-gray-100 text-gray-600'}`}
                              >
                                {ROLE_LABEL[u.role] ?? u.role}
                              </span>
                            ) : (
                              <select
                                value={u.role}
                                onChange={(e) =>
                                  setRoleTarget({ user: u, role: e.target.value as Role })
                                }
                                disabled={roleMutation.isPending}
                                className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                              >
                                {ASSIGNABLE_ROLES.map((r) => (
                                  <option key={r} value={r}>
                                    {ROLE_LABEL[r]}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                            {u.companyName || '-'}
                          </td>
                          <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                            {formatDate(u.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`flex items-center gap-1 text-xs ${u.isActive ? 'text-green-600' : 'text-red-500'}`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full ${u.isActive ? 'bg-green-400' : 'bg-red-400'}`}
                              />
                              {u.isActive ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {u.isActive ? (
                                <button
                                  onClick={() => {
                                    setActionError('');
                                    setDeactivateTarget({ user: u });
                                  }}
                                  disabled={isSelf}
                                  title={isSelf ? 'No podés desactivar tu propia cuenta acá' : ''}
                                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg text-red-600 hover:bg-red-50 transition disabled:opacity-40"
                                >
                                  <UserX size={14} /> Desactivar
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setActionError('');
                                    reactivateMutation.mutate(u.id);
                                  }}
                                  disabled={reactivateMutation.isPending}
                                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg text-green-600 hover:bg-green-50 transition"
                                >
                                  <UserCheck size={14} /> Reactivar
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setActionError('');
                                  setEmailTarget(u);
                                }}
                                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg text-gray-500 hover:bg-gray-100 transition"
                                title="Cambiar correo"
                              >
                                <Mail size={14} />
                              </button>
                              <button
                                onClick={() => setHistoryUser(u)}
                                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg text-gray-500 hover:bg-gray-100 transition"
                                title="Historial de roles"
                              >
                                <History size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {data?.totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-gray-100">
                  <span className="text-sm text-gray-500">
                    Página {data.page} de {data.totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="px-2 sm:px-3 py-1 text-xs sm:text-sm border rounded-lg disabled:opacity-50"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page >= data.totalPages}
                      className="px-2 sm:px-3 py-1 text-xs sm:text-sm border rounded-lg disabled:opacity-50"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Confirmar desactivación */}
      {deactivateTarget && (
        <ConfirmModal
          title="¿Desactivar usuario?"
          body={`${deactivateTarget.user.firstName} ${deactivateTarget.user.lastName} no podrá iniciar sesión. Su historial se conserva. No se puede desactivar si tiene cargas o viajes activos.`}
          confirmLabel="Sí, desactivar"
          danger
          loading={deactivateMutation.isPending}
          onConfirm={() => deactivateMutation.mutate(deactivateTarget.user.id)}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}

      {/* Confirmar cambio de rol */}
      {roleTarget && (
        <ConfirmModal
          title="¿Cambiar el rol?"
          body={`Vas a cambiar el rol de ${roleTarget.user.firstName} ${roleTarget.user.lastName} de "${ROLE_LABEL[roleTarget.user.role]}" a "${ROLE_LABEL[roleTarget.role]}". Los permisos se actualizan de inmediato y queda registrado.`}
          confirmLabel="Cambiar rol"
          loading={roleMutation.isPending}
          onConfirm={() => roleMutation.mutate({ id: roleTarget.user.id, role: roleTarget.role })}
          onCancel={() => setRoleTarget(null)}
        />
      )}

      {/* Cambiar email */}
      {emailTarget && (
        <ChangeEmailModal
          user={emailTarget}
          loading={emailMutation.isPending}
          onConfirm={(email) => emailMutation.mutate({ id: emailTarget.id, email })}
          onCancel={() => setEmailTarget(null)}
        />
      )}

      {/* Historial de roles */}
      {historyUser && (
        <RoleHistoryModal user={historyUser} onClose={() => setHistoryUser(null)} />
      )}
    </DashboardLayout>
  );
}

function ChangeEmailModal({
  user,
  loading,
  onConfirm,
  onCancel,
}: {
  user: any;
  loading?: boolean;
  onConfirm: (email: string) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState('');
  return (
    <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" className="bg-surface-raised rounded-xl shadow-xl max-w-md w-full p-6">
        <h3 className="font-medium text-lg flex items-center gap-2">
          <Mail size={18} /> Cambiar correo
        </h3>
        <p className="text-ink-600 text-sm mt-3">
          Correo actual de {user.firstName} {user.lastName}:{' '}
          <span className="font-medium">{user.email}</span>. El usuario deberá verificar la nueva
          dirección antes de volver a iniciar sesión.
        </p>
        <input
          type="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nuevo@correo.com"
          className="mt-4 w-full px-4 py-2.5 bg-surface-raised border border-ink-200 rounded-lg text-[14px] focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 outline-none transition"
        />
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-ink-200 text-ink-700 hover:bg-ink-50 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(email.trim())}
            disabled={loading || !email.trim()}
            className="px-4 py-2 rounded-lg bg-ink-900 text-white hover:bg-ink-800 disabled:opacity-50 text-sm"
          >
            {loading ? 'Procesando…' : 'Cambiar correo'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  danger,
  loading,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" className="bg-surface-raised rounded-xl shadow-xl max-w-md w-full p-6">
        <h3 className={`font-medium text-lg flex items-center gap-2 ${danger ? 'text-danger-700' : ''}`}>
          {danger && <AlertTriangle size={18} />} {title}
        </h3>
        <p className="text-ink-600 text-sm mt-3">{body}</p>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-ink-200 text-ink-700 hover:bg-ink-50 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-lg text-white disabled:opacity-50 text-sm ${
              danger ? 'bg-danger-600 hover:bg-danger-700' : 'bg-ink-900 hover:bg-ink-800'
            }`}
          >
            {loading ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleHistoryModal({ user, onClose }: { user: any; onClose: () => void }) {
  const { data, isLoading } = useQuery<RoleChangeLog[]>({
    queryKey: ['role-history', user.id],
    queryFn: () => usersApi.getUserRoleHistory(user.id).then((r) => r.data),
  });

  return (
    <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface-raised rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
        <h3 className="font-medium text-lg flex items-center gap-2">
          <History size={18} /> Historial de roles
        </h3>
        <p className="text-ink-500 text-sm mt-1">
          {user.firstName} {user.lastName}
        </p>
        <div className="mt-4">
          {isLoading ? (
            <p className="text-ink-400 text-sm py-6 text-center">Cargando…</p>
          ) : !data || data.length === 0 ? (
            <p className="text-ink-400 text-sm py-6 text-center">Sin cambios de rol registrados.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {data.map((log) => (
                <li key={log.id} className="py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-ink-500">{ROLE_LABEL[log.oldRole] ?? log.oldRole}</span>
                    <span className="text-ink-400">→</span>
                    <span className="font-medium">{ROLE_LABEL[log.newRole] ?? log.newRole}</span>
                  </div>
                  <p className="text-ink-400 text-xs mt-1">
                    {formatDate(log.createdAt)}
                    {log.changedBy &&
                      ` · por ${log.changedBy.firstName} ${log.changedBy.lastName}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-ink-200 text-ink-700 hover:bg-ink-50 text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
