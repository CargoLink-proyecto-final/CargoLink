'use client';

import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { usersApi, loadsApi, tripsApi } from '@/lib/api';
import { getStatusColor } from '@/lib/utils';
import { Users, Package, Truck, Activity } from 'lucide-react';

export default function AdminDashboard() {
  const { data: usersData } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => usersApi.getAll({ limit: 100 }).then((r) => r.data),
  });

  const { data: loadsData } = useQuery({
    queryKey: ['admin-loads'],
    queryFn: () => loadsApi.getAll({ limit: 100 }).then((r) => r.data),
  });

  const { data: tripsData } = useQuery({
    queryKey: ['admin-trips'],
    queryFn: () => tripsApi.getAll({ limit: 100 }).then((r) => r.data),
  });

  const users = usersData?.users || [];
  const loads = loadsData?.loads || [];
  const trips = tripsData?.trips || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Panel de Administrador</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total de Usuarios', value: usersData?.total || 0, icon: Users, color: 'text-blue-600 bg-blue-50' },
            { label: 'Total de Cargas', value: loadsData?.total || 0, icon: Package, color: 'text-green-600 bg-green-50' },
            { label: 'Total de Viajes', value: tripsData?.total || 0, icon: Truck, color: 'text-orange-600 bg-orange-50' },
            { label: 'Viajes Activos', value: trips.filter((t: any) => t.status === 'IN_PROGRESS').length, icon: Activity, color: 'text-purple-600 bg-purple-50' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${stat.color}`}>
                  <stat.icon size={20} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-semibold">Usuarios Recientes</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {users.slice(0, 8).map((user: any) => (
                <div key={user.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{user.firstName} {user.lastName}</p>
                    <p className="text-sm text-gray-500">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${user.role === 'SHIPPER' ? 'bg-blue-100 text-blue-700' : user.role === 'CARRIER' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'}`}>
                      {user.role}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${user.isActive ? 'bg-green-400' : 'bg-red-400'}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-semibold">Cargas Recientes</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {loads.slice(0, 8).map((load: any) => (
                <div key={load.id} className="flex items-center justify-between p-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{load.title}</p>
                    <p className="text-sm text-gray-500 truncate">{load.shipper?.firstName} {load.shipper?.lastName}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(load.status)}`}>
                    {load.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
