'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { AuthorizedAgencySummary } from '@stopallcalls/contracts';

// RAD-19: accessible combobox over /api/agencies/search. Free text is always
// valid — the registry assists, it never gates: an unlisted or unlicensed
// collector is exactly the case the funnel exists for. Any search failure
// (network, 4xx/5xx, abort) silently degrades to a plain input.

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

interface Props {
  value: string;
  /** Consumer's province/state (free text ok) — used as a ranking boost. */
  region?: string;
  country?: string;
  disabled?: boolean;
  required?: boolean;
  onChange: (name: string) => void;
  onSelect: (agency: AuthorizedAgencySummary) => void;
}

export default function AgencyTypeahead({ value, region, country, disabled, required, onChange, onSelect }: Props) {
  const listboxId = useId();
  const [options, setOptions] = useState<AuthorizedAgencySummary[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Suppresses the lookup for the programmatic value change after a pick.
  const justSelected = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (justSelected.current) {
      justSelected.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < MIN_QUERY) {
      setOptions([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const params = new URLSearchParams({ q });
      if (region?.trim()) params.set('region', region.trim());
      if (country && /^(CA|US)$/i.test(country.trim())) params.set('country', country.trim().toUpperCase());
      fetch(`/api/agencies/search?${params}`, { signal: controller.signal })
        .then((res) => (res.ok ? (res.json() as Promise<{ agencies: AuthorizedAgencySummary[] }>) : null))
        .then((body) => {
          if (!body || controller.signal.aborted) return;
          setOptions(body.agencies);
          setOpen(body.agencies.length > 0);
          setActive(-1);
        })
        .catch(() => {
          /* degrade to plain input */
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, region, country]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const pick = (agency: AuthorizedAgencySummary) => {
    justSelected.current = true;
    setOpen(false);
    setOptions([]);
    setActive(-1);
    onSelect(agency);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(options[active]!);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="typeahead">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listboxId}-${active}` : undefined}
        autoComplete="off"
        required={required}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {open && (
        <ul className="typeahead-list" role="listbox" id={listboxId} aria-label="Licensed agency suggestions">
          {options.map((a, i) => (
            <li
              key={a.id}
              id={`${listboxId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              // mousedown beats the input's blur; click would arrive too late.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(a);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span>{a.name}</span>
              <small>
                {a.region}
                {a.licenceNumber ? ` · licence ${a.licenceNumber}` : ''}
                {a.licenceStatus !== 'active' ? ` · ${a.licenceStatus.toUpperCase()}` : ''}
              </small>
            </li>
          ))}
        </ul>
      )}
      <span className="sr-only" role="status">
        {open ? `${options.length} licensed agency suggestions available` : ''}
      </span>
    </div>
  );
}
