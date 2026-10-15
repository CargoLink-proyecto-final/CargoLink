'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, Clock, Eye, Upload, XCircle } from 'lucide-react';
import { transporterProfileApi } from '@/lib/api';
import type { DocumentStatus, DocumentType, TransporterDocument } from '@/types';

const STATUS_META: Record<DocumentStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  PENDING: { label: 'En revisión', className: 'text-warning-700 bg-warning-50', Icon: Clock },
  APPROVED: { label: 'Aprobado', className: 'text-success-700 bg-success-50', Icon: CheckCircle2 },
  REJECTED: { label: 'Rechazado', className: 'text-danger-700 bg-danger-50', Icon: XCircle },
};

interface Props {
  type: DocumentType;
  label: string;
  document?: TransporterDocument;
  onUpload: (type: DocumentType, file: File) => void;
  uploading: boolean;
}

export default function DocumentRow({ type, label, document, onUpload, uploading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState(false);
  const [viewError, setViewError] = useState('');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onUpload(type, file);
  };

  // El endpoint exige auth (son DNI y licencias): no se puede linkear directo,
  // hay que traer el archivo como blob y abrirlo con una object URL.
  const handleView = async () => {
    if (!document) return;
    setViewing(true);
    setViewError('');
    try {
      const res = await transporterProfileApi.getDocumentFile(document.id);
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setViewError('No se pudo abrir el archivo');
    } finally {
      setViewing(false);
    }
  };

  const statusMeta = document ? STATUS_META[document.status] : null;
  const StatusIcon = statusMeta?.Icon;

  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-ink-100 last:border-0">
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-ink-800">{label}</p>
        {statusMeta && StatusIcon ? (
          <span className={`inline-flex items-center gap-1 mt-1 text-[11px] px-2 py-0.5 rounded-full ${statusMeta.className}`}>
            <StatusIcon size={11} /> {statusMeta.label}
          </span>
        ) : (
          <span className="text-[11px] text-ink-400">No subido</span>
        )}
        {document?.status === 'REJECTED' && document.rejectionReason && (
          <p className="text-[12px] text-danger-700 mt-1">
            Motivo: {document.rejectionReason}. Reemplazalo para que lo revisemos de nuevo.
          </p>
        )}
        {viewError && <p className="text-danger-600 text-xs mt-1">{viewError}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {document && (
          <button
            type="button"
            onClick={handleView}
            disabled={viewing}
            className="text-ink-500 hover:text-primary-700 p-2 rounded-lg transition disabled:opacity-50"
            aria-label={`Ver ${label}`}
          >
            <Eye size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary-700 hover:text-primary-800 border border-primary-200 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
        >
          <Upload size={13} /> {document ? 'Reemplazar' : 'Subir'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  );
}
