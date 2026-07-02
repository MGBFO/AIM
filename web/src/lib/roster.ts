/* ============================================================================
   Analyst roster + naming rules — ported from Analysis_in_Motion_V5.html.
   Canonical order is fixed; it drives Bandwidth card order and pickers.
   ========================================================================== */

export const APPROVED_ANALYSTS = [
  'Unassigned',
  'Mike Gregory',
  'Jack Griffin',
  'Harrison Fritz',
  'Intern',
] as const;
export type AnalystName = (typeof APPROVED_ANALYSTS)[number];

/** analyst_code -> canonical display name. */
export const ANALYST_CODES: Record<string, AnalystName> = {
  MG: 'Mike Gregory',
  JG: 'Jack Griffin',
  HF: 'Harrison Fritz',
};

/** Slash-separated entity strings, never comma-separated. */
export const ENTITY_SEP = '/';

/** Legacy value aliases carried over from the source spreadsheets. */
export const ALIAS: Record<string, string> = {
  'L&B': 'Land & Buildings',
  OWS: 'One William St.',
};

// Travel raw-code -> canonical name
export const TRAVEL_ANALYST_MAP: Record<string, AnalystName> = {
  MG: 'Mike Gregory',
  JG: 'Jack Griffin',
  HF: 'Harrison Fritz',
  Intern: 'Intern',
  Unassigned: 'Unassigned',
};

// Monitoring raw-value -> canonical name
export const MON_ANALYST_MAP: Record<string, AnalystName> = {
  'Mike G.': 'Mike Gregory', MG: 'Mike Gregory', Mike: 'Mike Gregory',
  'Jack G.': 'Jack Griffin', JG: 'Jack Griffin', Jack: 'Jack Griffin',
  'Harrison F.': 'Harrison Fritz', HF: 'Harrison Fritz', Harrison: 'Harrison Fritz',
  Intern: 'Intern',
};

export function applyAlias(s: string | null | undefined): string | null | undefined {
  if (!s) return s;
  const t = String(s).trim();
  return ALIAS[t] || t;
}

/** Alias each slash-separated segment of a multi-entity cell. */
export function aliasMulti(s: string | null | undefined): string | null | undefined {
  if (!s) return s;
  return String(s)
    .split('/')
    .map((x) => applyAlias(x.trim()))
    .join('/');
}
