'use client';

import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { tripsApi, loadsApi } from '@/lib/api';
import { formatCurrency, getStatusColor } from '@/lib/utils';
import { Truck, Package, Clock, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function CarrierDashboard() {
  const { data: tripsData, isLoading: tripsLoading } = useQuery({
    queryKey: ['my-trips'],
    queryFn: () => tripsApi.getMy().then((r) => r.data),
  });

  const { data: loadsData } = useQuery({
    queryKey: ['available-loads'],
    queryFn: () => loadsApi.getAvailable({ limit: 5 }).then((r) => r.data),
  });

  const trips = tripsData?.trips || [];
  const availableLoads = loadsData?.loads || [];

  const stats = {
    total: trips.length,
    active: trips.filter((t: any) => t.status === 'IN_PROGRESS').length,
    accepted: trips.filter((t: any) => t.status === 'ACCEPTED').length,
    completed: trips.filter((t: any) => t.status === 'COMPLETED').length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Panel del Transportista</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total de Viajes', value: stats.total, icon: Truck, color: 'text-blue-600 bg-blue-50' },
            { label: 'Activos', value: stats.active, icon: Clock, color: 'text-orange-600 bg-orange-50' },
            { label: 'Aceptados', value: stats.accepted, icon: Package, color: 'text-yellow-600 bg-yellow-50' },
            { label: 'Completados', value: stats.completed, icon: CheckCircle, color: 'text-green-600 bg-green-50' },
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
              <h2 className="font-semibold">Cargas Disponibles</h2>
            </div>
            {availableLoads.length === 0 ? (
              <div className="p-10 text-center text-gray-400">Sin cargas disponibles</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {availableLoads.map((load: any) => (
                  <Link
                    key={load.id}
                    href={`/loads/${load.id}`}
                    className="block p-4 hover:bg-gray-50 transition"
                  >
                    <p className="font-medium">{load.title}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {load.originAddress} → {load.destAddress}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-sm font-semibold text-primary-600">
                        {formatCurrency(load.price)}
                      </span>
                      <span className="text-xs text-gray-400">{load.weight} kg</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-semibold">Mis Viajes Activos</h2>
            </div>
            {tripsLoading ? (
              <div className="p-10 text-center text-gray-400">Cargando...</div>
            ) : trips.length === 0 ? (
              <div className="p-10 text-center text-gray-400">Sin viajes aún</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {trips.slice(0, 5).map((trip: any) => (
                  <Link
                    key={trip.id}
                    href={`/trips/${trip.id}`}
                    className="block p-4 hover:bg-gray-50 transition"
                  >
                    <p className="font-medium">{trip.load?.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(trip.status)}`}>
                        {trip.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
