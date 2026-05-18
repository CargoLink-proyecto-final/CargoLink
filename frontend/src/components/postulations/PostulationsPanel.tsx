'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { postulationsApi } from '@/lib/api';
import type { PostulationWithTransporter } from '@/types';
import PostulationCard from './PostulationCard';

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

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Postulaciones</p>
          <h2 className="font-display text-lg font-semibold">
            Transportistas interesados{' '}
            <span className="text-ink-500 font-normal">
              ({data?.length ?? 0})
            </span>
          </h2>
        </div>
      </div>

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
              canAccept={canAccept && p.status === 'PENDING'}
              onAccept={() => acceptMutation.mutate(p.id)}
              accepting={
                acceptMutation.isPending && acceptMutation.variables === p.id
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
