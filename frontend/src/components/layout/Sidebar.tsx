'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { messagesApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Package,
  Truck,
  MapPin,
  MessageSquare,
  Users,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';

const navItems = {
  SHIPPER: [
    { href: '/dashboard/shipper', label: 'Panel', icon: LayoutDashboard },
    { href: '/loads', label: 'Mis Cargas', icon: Package },
    { href: '/loads/new', label: 'Nueva Carga', icon: Truck },
    { href: '/tracking', label: 'Seguimiento', icon: MapPin },
    { href: '/messages', label: 'Mensajes', icon: MessageSquare },
  ],
  CARRIER: [
    { href: '/dashboard/carrier', label: 'Panel', icon: LayoutDashboard },
    { href: '/loads', label: 'Cargas Disponibles', icon: Package },
    { href: '/tracking', label: 'Mis Viajes', icon: Truck },
    { href: '/messages', label: 'Mensajes', icon: MessageSquare },
  ],
  ADMIN: [
    { href: '/dashboard/admin', label: 'Panel', icon: LayoutDashboard },
    { href: '/loads', label: 'Todas las Cargas', icon: Package },
    { href: '/tracking', label: 'Seguimiento', icon: MapPin },
    { href: '/users', label: 'Usuarios', icon: Users },
    { href: '/messages', label: 'Mensajes', icon: MessageSquare },
  ],
};

export default function Sidebar() {
  const { user } = useAuthStore();
  if (!user) return null;
  return <SidebarContent user={user} />;
}

type AuthUser = NonNullable<ReturnType<typeof useAuthStore.getState>['user']>;

function SidebarContent({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuthStore();
  const [open, setOpen] = useState(false);

  const { data: unreadData } = useQuery({
    queryKey: ['unreadCount'],
    queryFn: () => messagesApi.getUnreadCount().then((r) => r.data),
    staleTime: 0,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const unreadCount = unreadData?.unreadCount || 0;

  const items = navItems[user.role] || [];

  const handleLogout = () => {
    logout();
    router.push('/auth/login');
  };

  return (
    <>
      <button
        className="lg:hidden fixed top-4 left-4 z-50 bg-white p-2 rounded-lg shadow-md"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transform transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-gray-100">
            <h1 className="text-2xl font-bold text-primary-700">CargoLink</h1>
            <p className="text-xs text-gray-400 mt-1">Panel {user.role === 'SHIPPER' ? 'TRANSPORTISTA' : user.role === 'CARRIER' ? 'TRANSPORTADOR' : 'ADMINISTRADOR'}</p>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            {items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              const isMessages = item.href === '/messages';
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition relative',
                    active
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  <Icon size={18} />
                  {item.label}
                  {isMessages && unreadCount > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-100">
            <div className="flex items-center gap-3 px-4 py-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-medium text-sm">
                {user.firstName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 w-full transition"
            >
              <LogOut size={18} />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 bg-black/20 z-30 lg:hidden" onClick={() => setOpen(false)} />
      )}
    </>
  );
}
