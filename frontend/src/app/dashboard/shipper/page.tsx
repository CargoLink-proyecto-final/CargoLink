'use client';

import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { loadsApi } from '@/lib/api';
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils';
import { Package, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function ShipperDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-loads'],
    queryFn: () => loadsApi.getMy().then((r) => r.data),
  });

  const loads = data?.loads || [];
  const stats = {
    total: loads.length,
    published: loads.filter((l: any) => l.status === 'PUBLISHED').length,
    inTransit: loads.filter((l: any) => l.status === 'IN_TRANSIT').length,
    delivered: loads.filter((l: any) => l.status === 'DELIVERED').length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Panel del Generador de Carga</h1>
          <Link
            href="/loads/new"
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            + Nueva Carga
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total de Cargas', value: stats.total, icon: Package, color: 'text-blue-600 bg-blue-50' },
            { label: 'Publicadas', value: stats.published, icon: TrendingUp, color: 'text-green-600 bg-green-50' },
            { label: 'En Tránsito', value: stats.inTransit, icon: Clock, color: 'text-orange-600 bg-orange-50' },
            { label: 'Entregadas', value: stats.delivered, icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50' },
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

        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <h2 className="font-semibold">Cargas Recientes</h2>
          </div>
          {isLoading ? (
            <div className="p-10 text-center text-gray-400">Cargando...</div>
          ) : loads.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              Sin cargas aún. ¡Crea tu primera carga!
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {loads.slice(0, 10).map((load: any) => (
                <Link
                  key={load.id}
                  href={`/loads/${load.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{load.title}</p>
                    <p className="text-sm text-gray-500 truncate">
                      {load.originAddress} → {load.destAddress}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span className="text-sm font-medium">{formatCurrency(load.price)}</span>
                    <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(load.status)}`}>
                      {load.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
