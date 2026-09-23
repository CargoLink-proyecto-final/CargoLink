'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { messagesApi, postulationsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { countAwaitingCarrierReply } from '@/lib/postulations';
import { useProfileStatus } from '@/lib/transporterProfile';
import type { PostulationWithLoad } from '@/types';
import {
  LayoutDashboard,
  Package,
  Truck,
  MessageSquare,
  Users,
  LogOut,
  Menu,
  X,
  ClipboardList,
  Building2,
  UserCheck,
  UserCog,
  Hand,
} from 'lucide-react';
import { useState } from 'react';

const navItems = {
  CARGO_GENERATOR: [
    { href: '/dashboard/shipper', label: 'Panel', icon: LayoutDashboard },
    { href: '/loads', label: 'Mis Cargas', icon: Package },
    { href: '/trips', label: 'Viajes', icon: Truck },
    { href: '/messages', label: 'Mensajes', icon: MessageSquare },
    { href: '/register', label: 'Registro', icon: ClipboardList },
  ],
  TRANSPORTER: [
    { href: '/dashboard/carrier', label: 'Panel', icon: LayoutDashboard },
    { href: '/loads', label: 'Cargas Disponibles', icon: Package },
    { href: '/postulations', label: 'Mis Postulaciones', icon: Hand },
    { href: '/trips', label: 'Mis Viajes', icon: Truck },
    { href: '/company', label: 'Mi Empresa', icon: Building2 },
    { href: '/messages', label: 'Mensajes', icon: MessageSquare },
    { href: '/register', label: 'Registro', icon: ClipboardList },
  ],
  COMPANY_ADMIN: [
    { href: '/dashboard/company-admin', label: 'Panel', icon: LayoutDashboard },
    { href: '/dashboard/company-admin/drivers', label: 'Conductores', icon: Users },
    { href: '/dashboard/company-admin/trips', label: 'Viajes', icon: Truck },
    { href: '/dashboard/company-admin/requests', label: 'Solicitudes', icon: UserCheck },
  ],
  ADMIN: [
    { href: '/dashboard/admin', label: 'Panel', icon: LayoutDashboard },
    { href: '/loads', label: 'Todas las Cargas', icon: Package },
    { href: '/trips', label: 'Viajes', icon: Truck },
    { href: '/users', label: 'Usuarios', icon: Users },
    { href: '/messages', label: 'Mensajes', icon: MessageSquare },
    { href: '/register', label: 'Registro', icon: ClipboardList },
  ],
};

const ROLE_LABEL: Record<string, string> = {
  CARGO_GENERATOR: 'Publicador de carga',
  TRANSPORTER: 'Transportista',
  ADMIN: 'Administrador',
  COMPANY_ADMIN: 'Administrador de empresa',
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

  // Solo el transportista tiene postulaciones propias; la ruta del backend está
  // restringida a ese rol, así que no la consultamos para los demás.
  const isTransporter = user.role === 'TRANSPORTER';
  const { data: myPostulations } = useQuery({
    queryKey: ['my-postulations'],
    queryFn: () => postulationsApi.getMy().then((r) => r.data as PostulationWithLoad[]),
    enabled: isTransporter,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const { data: profileStatus } = useProfileStatus();
  const profileIncomplete = isTransporter && profileStatus ? !profileStatus.complete : false;

  const unreadCount = unreadData?.unreadCount || 0;
  const postulationsAwaitingReply = countAwaitingCarrierReply(myPostulations ?? []);
  // El burger de mobile resume todo lo que pide atención, porque el nav está oculto.
  const pendingTotal = unreadCount + postulationsAwaitingReply + (profileIncomplete ? 1 : 0);
  const items = navItems[user.role] || [];
  const handleLogout = () => { logout(); router.push('/auth/login'); };
  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || '·';

  return (
    <>
      {/* Mobile burger */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 bg-ink-900 text-surface-raised p-2.5 rounded-lg shadow-raised"
        onClick={() => setOpen(!open)}
        aria-label="Toggle navigation"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
        {!open && pendingTotal > 0 && (
          <span className="absolute -top-1 -right-1 bg-primary-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {pendingTotal > 99 ? '99+' : pendingTotal}
          </span>
        )}
      </button>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-ink-900 text-ink-200 transform transition-transform lg:translate-x-0',
          'border-r border-ink-800',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="relative flex flex-col h-full z-10">
          {/* Brand */}
          <div className="px-6 pt-7 pb-6">
            <Link href="/" className="block group">
              <span className="font-display font-semibold text-[26px] leading-none text-surface-raised tracking-tight">
                Cargo<span className="text-primary-400">Link</span>
              </span>
              <span className="block mt-2 text-[10px] uppercase tracking-[0.22em] text-ink-400">
                {ROLE_LABEL[user.role] ?? user.role}
              </span>
            </Link>
          </div>

          <div className="h-px mx-6 bg-ink-800" />

          {/* Nav */}
          <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto scrollbar-thin">
            {items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              const badge =
                item.href === '/messages'
                  ? unreadCount
                  : item.href === '/postulations'
                    ? postulationsAwaitingReply
                    : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition group',
                    active
                      ? 'bg-ink-800/70 text-surface-raised'
                      : 'text-ink-300 hover:text-surface-raised hover:bg-ink-800/40',
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary-500" aria-hidden />
                  )}
                  <Icon size={16} className={cn('shrink-0 transition', active ? 'text-primary-400' : 'text-ink-400 group-hover:text-ink-200')} />
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span className="bg-primary-500 text-white text-[10px] font-semibold rounded-full min-w-[20px] h-[18px] flex items-center justify-center px-1.5 tabular-nums">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User block */}
          <div className="px-3 pb-4 pt-3 border-t border-ink-800">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <div className="w-9 h-9 rounded-full bg-primary-500/15 text-primary-300 flex items-center justify-center text-[12px] font-semibold font-mono ring-1 ring-primary-500/30">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-surface-raised truncate">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-[11px] font-mono text-ink-400 truncate">{user.email}</p>
              </div>
            </div>
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className={cn(
                'mt-1 flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] w-full transition',
                pathname === '/profile'
                  ? 'bg-ink-800/70 text-surface-raised'
                  : 'text-ink-300 hover:bg-ink-800/40 hover:text-surface-raised',
              )}
            >
              <UserCog size={15} />
              <span className="flex-1">Mi perfil</span>
              {profileIncomplete && (
                <span
                  className="bg-primary-500 text-white text-[10px] font-semibold rounded-full min-w-[20px] h-[18px] flex items-center justify-center px-1.5"
                  aria-label="Perfil incompleto"
                >
                  !
                </span>
              )}
            </Link>
            <button
              onClick={handleLogout}
              className="mt-1 flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-ink-300 hover:bg-danger-600/10 hover:text-danger-600 w-full transition"
            >
              <LogOut size={15} />
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm z-30 lg:hidden" onClick={() => setOpen(false)} />
      )}
    </>
  );
}
