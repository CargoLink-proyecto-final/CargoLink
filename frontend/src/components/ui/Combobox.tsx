'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

export interface ComboboxOption {
  /** Clave estable de la opción (id del padrón). */
  id: string;
  /** Texto que queda en el input al elegirla. */
  value: string;
  /** Línea secundaria — desambigua homónimos (ej. "Río Segundo, Córdoba"). */
  hint?: string;
}

interface ComboboxProps {
  value: string;
  /**
   * Id de la opción elegida. Sin esto la marca de "seleccionada" se decide por
   * texto, y los homónimos (tres "Pilar" en el país) aparecen todos tildados.
   */
  selectedId?: string;
  onChange: (value: string, option?: ComboboxOption) => void;
  options: ComboboxOption[];
  /** Se dispara al tipear: quien lo usa decide si filtra local o pide al server. */
  onQueryChange?: (query: string) => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  inputClassName?: string;
  id?: string;
  'aria-label'?: string;
}

/**
 * Select con búsqueda por teclado: se ve como un desplegable pero permite
 * escribir para filtrar. El valor que expone es siempre el texto de la opción,
 * así los formularios que ya guardaban un string no cambian de contrato.
 */
export default function Combobox({
  value,
  selectedId,
  onChange,
  options,
  onQueryChange,
  loading = false,
  disabled = false,
  placeholder,
  emptyLabel = 'Sin resultados',
  className = '',
  inputClassName = '',
  id,
  'aria-label': ariaLabel,
}: ComboboxProps) {
  const generatedId = useId();
  const listboxId = `${id ?? generatedId}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Cerrado muestra el valor elegido; abierto, lo que se está tipeando.
  const inputValue = open ? query : value;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (highlighted >= options.length) setHighlighted(0);
  }, [options.length, highlighted]);

  useEffect(() => {
    if (!open) return;
    const item = listRef.current?.children[highlighted] as HTMLElement | undefined;
    // Optional call: jsdom (tests) no implementa scrollIntoView.
    item?.scrollIntoView?.({ block: 'nearest' });
  }, [highlighted, open]);

  const openWith = (nextQuery: string) => {
    setQuery(nextQuery);
    setHighlighted(0);
    setOpen(true);
    onQueryChange?.(nextQuery);
  };

  const select = (option: ComboboxOption) => {
    onChange(option.value, option);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { openWith(''); return; }
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted((current) => {
        if (options.length === 0) return 0;
        return (current + delta + options.length) % options.length;
      });
      return;
    }
    if (event.key === 'Enter' && open) {
      const option = options[highlighted];
      if (option) { event.preventDefault(); select(option); }
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setQuery('');
    }
  };

  const showClear = useMemo(() => value.length > 0 && !disabled, [value, disabled]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        disabled={disabled}
        value={inputValue}
        placeholder={placeholder}
        // Los campos son angostos y hay nombres largos ("Ciudad Autónoma de
        // Buenos Aires"): el tooltip deja leer el valor completo.
        title={!open && value ? value : undefined}
        onChange={(event) => openWith(event.target.value)}
        onFocus={() => openWith('')}
        // Además del foco: si ya está enfocado (recién se eligió una opción),
        // onFocus no vuelve a dispararse y el clic no reabriría la lista.
        onClick={() => { if (!open) openWith(''); }}
        onKeyDown={handleKeyDown}
        className={`${inputClassName} pr-14`}
      />

      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {showClear && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Borrar selección"
            onClick={() => { onChange(''); setQuery(''); onQueryChange?.(''); }}
            className="text-ink-400 hover:text-ink-700 transition"
          >
            <X size={14} />
          </button>
        )}
        <ChevronDown
          size={15}
          aria-hidden
          className={`text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </div>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-ink-200 bg-surface-raised shadow-lg py-1 text-[13.5px]"
        >
          {loading && <li className="px-3 py-2 text-ink-400">Buscando…</li>}
          {!loading && options.length === 0 && (
            <li className="px-3 py-2 text-ink-400">{emptyLabel}</li>
          )}
          {!loading && options.map((option, index) => {
            const selected = selectedId ? option.id === selectedId : option.value === value;
            return (
              <li
                key={option.id}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setHighlighted(index)}
                onMouseDown={(event) => { event.preventDefault(); select(option); }}
                className={`px-3 py-1.5 cursor-pointer flex items-center justify-between gap-2 ${
                  index === highlighted ? 'bg-primary-50 text-primary-700' : 'text-ink-800'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate" title={option.value}>{option.value}</span>
                  {option.hint && (
                    <span className="block text-[11px] text-ink-500 truncate" title={option.hint}>
                      {option.hint}
                    </span>
                  )}
                </span>
                {selected && <Check size={14} className="shrink-0 text-primary-700" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
