/* Build an in-memory AimState from the committed reference seed, for DEMO mode.
   Mirrors the normalization in scripts/import_seed.ts (level strip, analyst
   normalize, target days by level, quarter-placeholder dates -> null). */
import rawSeed from '../data/seed.reference.json';
import { uid } from './util';
import { normalizeAnalystName } from './roster';
import { parseLevel, levelDays } from './monitoring';
import { cleanCost, cleanDays } from './format';
import {
  EMPTY_MAPPING, type AimState, type Trip, type Monitoring, type PrcSchedule, type PrcArchive, type PrcMapping,
} from './domain';
import type { TripSection } from './types';

interface RawTrip { section?: string; date?: string | null; days?: unknown; city?: string; analyst?: string; monitoringVisits?: string; event?: string; flight?: unknown; hotel?: unknown; car?: unknown; notesOtherVisits?: string }
interface RawMon { analyst?: string; fund?: string; level?: string; mostRecent?: string | null; monitoringDate?: string | null }
interface RawSched { presentation?: string; mostRecent?: string | null; projectedNext?: string | null; macro?: string; act40?: string; hedgeFund?: string; private?: string; newFunds?: unknown }
interface RawArch { meetingDate?: string | null; macro?: string; presentation?: string; act40?: string; hedgeFund?: string; private?: string; newFunds?: string }
interface RawSeedShape { travel: RawTrip[]; monitoring: RawMon[]; prcSchedule: RawSched[]; prcArchive: RawArch[]; prcMapping: PrcMapping }

const raw = rawSeed as unknown as RawSeedShape;
const iso = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function buildDemoState(): AimState {
  const trips: Trip[] = (raw.travel || []).map((t) => ({
    id: uid('trip'), section: (t.section as TripSection) || 'upcoming', date: iso(t.date),
    days: cleanDays(t.days), city: t.city ?? '', analyst: t.analyst ?? '', monitoringVisits: t.monitoringVisits ?? '',
    event: t.event ?? '', flight: cleanCost(t.flight), hotel: cleanCost(t.hotel), car: cleanCost(t.car),
    notesOtherVisits: t.notesOtherVisits ?? '', permanent: false, permanentOriginId: null,
  }));
  const monitoring: Monitoring[] = (raw.monitoring || []).map((m) => {
    const level = parseLevel(m.level);
    const l1 = level === 'Level 1';
    return {
      id: uid('mon'), fund: m.fund ?? '', analyst: normalizeAnalystName(m.analyst), level,
      mostRecent: iso(m.mostRecent), monitoringDate: iso(m.monitoringDate), status: 'Not Started',
      annualOnsite: l1, complianceCheck: l1, targetMonitoringDays: levelDays(level), archived: false,
    };
  });
  const prcSchedule: PrcSchedule[] = (raw.prcSchedule || []).map((r) => ({
    id: uid('ms'), presentation: r.presentation ?? '', mostRecent: iso(r.mostRecent), projectedNext: iso(r.projectedNext),
    macro: r.macro ?? '', act40: r.act40 ?? '', hedgeFund: r.hedgeFund ?? '', private: r.private ?? '',
    newFunds: r.newFunds != null ? String(r.newFunds) : '',
  }));
  const prcArchive: PrcArchive[] = (raw.prcArchive || []).map((r) => ({
    id: uid('ar'), meetingDate: iso(r.meetingDate), macro: r.macro ?? '', presentation: r.presentation ?? '',
    act40: r.act40 ?? '', hedgeFund: r.hedgeFund ?? '', private: r.private ?? '', newFunds: r.newFunds ?? '', sharepointUrl: '',
  }));
  return {
    trips, monitoring, prcSchedule, prcArchive,
    prcMapping: raw.prcMapping ?? EMPTY_MAPPING,
    tasks: [], usefulLinks: [], monRollover: null, prefs: { abPeriod: 'Current Month' },
  };
}
