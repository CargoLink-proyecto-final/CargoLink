'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/auth/login');
      return;
    }

    switch (user?.role) {
      case 'ADMIN':
        router.replace('/dashboard/admin');
        break;
      case 'CARGO_GENERATOR':
        router.replace('/dashboard/shipper');
        break;
      case 'TRANSPORTER':
        router.replace('/dashboard/carrier');
        break;
      default:
        router.replace('/auth/login');
    }
  }, [isAuthenticated, user, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  );
}
