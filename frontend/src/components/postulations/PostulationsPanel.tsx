'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { postulationsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type { PostulationWithTransporter } from '@/types';
import PostulationCard from './PostulationCard';

// Oferta vigente del transportista en una postulación: su contra-oferta si fue
// el último en ofertar, sino el precio propuesto; si no propuso nada, acepta el
// precio listado.
function transporterCurrentOffer(p: PostulationWithTransporter, listedPrice: number): number {
  if (p.status === 'NEGOTIATING' && p.lastOfferBy === 'TRANSPORTER' && p.counterOfferPrice != null) {
    return p.counterOfferPrice;
  }
  return p.proposedPrice ?? listedPrice;
}

interface Props {
  loadId: string;
  listedPrice: number;
  canAccept: boolean;
}

export default function PostulationsPanel({ loadId, listedPrice, canAccept }: Props) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['postulations', loadId],
    queryFn: () =>
      postulationsApi
        .getForLoad(loadId)
        .then((r) => r.data as PostulationWithTransporter[]),
  });

  const acceptMutation = useMutation({
    mutationFn: (postulationId: string) => postulationsApi.accept(postulationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['load', loadId] });
      queryClient.invalidateQueries({ queryKey: ['postulations', loadId] });
    },
  });

  const counterOfferMutation = useMutation({
    mutationFn: ({ postulationId, price }: { postulationId: string; price: number }) =>
      postulationsApi.counterOffer(postulationId, price),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['postulations', loadId] });
    },
  });

  const total = data?.length ?? 0;
  const averageOffer =
    total > 0
      ? data!.reduce((sum, p) => sum + transporterCurrentOffer(p, listedPrice), 0) / total
      : 0;

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Postulaciones</p>
          <h2 className="font-display text-lg font-semibold">
            Transportistas interesados{' '}
            <span className="text-ink-500 font-normal">
              ({total})
            </span>
          </h2>
        </div>
      </div>

      {/* Resumen para el publicador: total de postulaciones + precio promedio
          ofertado (solo visible en esta vista del dueño de la carga). */}
      {total > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-card border border-ink-200/60 bg-surface-sunk p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-ink-500">Postulaciones</p>
            <p className="font-display text-xl font-semibold text-ink-900">{total}</p>
          </div>
          <div className="rounded-card border border-ink-200/60 bg-surface-sunk p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-ink-500">Precio promedio ofertado</p>
            <p className="font-display text-xl font-semibold text-ink-900">{formatCurrency(averageOffer)}</p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="text-sm text-ink-500">Cargando postulaciones...</div>
      )}

      {!isLoading && (!data || data.length === 0) && (
        <div className="text-sm text-ink-500 text-center py-6">
          Todavía no hay postulaciones para esta carga.
        </div>
      )}

      {data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((p) => (
            <PostulationCard
              key={p.id}
              postulation={p}
              listedPrice={listedPrice}
              canAccept={canAccept && (p.status === 'PENDING' || p.status === 'NEGOTIATING')}
              onAccept={() => acceptMutation.mutate(p.id)}
              accepting={acceptMutation.isPending && acceptMutation.variables === p.id}
              onCounterOffer={(price) =>
                counterOfferMutation.mutate({ postulationId: p.id, price })
              }
              counteringOffer={
                counterOfferMutation.isPending &&
                counterOfferMutation.variables?.postulationId === p.id
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
