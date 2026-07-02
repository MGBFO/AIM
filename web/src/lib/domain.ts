/* ============================================================================
   Domain model — camelCase objects the modules work with (mirrors the legacy
   `aim.v2.state` shape), plus mappers to/from the snake_case Supabase rows.
   Keeping the domain shape identical to the legacy state lets the ported module
   bodies stay close to the spec.
   ========================================================================== */
import type { ISODate } from './dates';
import type {
  TripRow, MonitoringRow, PrcScheduleRow, PrcArchiveRow, TaskRow, UsefulLinkRow,
  MonitoringLevel, TripSection, TaskStatus,
} from './types';

export interface Trip {
  id: string;
  section: TripSection;
  date: ISODate | null;
  days: number | null;
  city: string;
  analyst: string;
  monitoringVisits: string;
  event: string;
  flight: number | null;
  hotel: number | null;
  car: number | null;
  notesOtherVisits: string;
  permanent: boolean;
  permanentOriginId: string | null;
  updatedAt?: string;
}

export interface Monitoring {
  id: string;
  fund: string;
  analyst: string;
  level: MonitoringLevel;
  mostRecent: ISODate | null;
  monitoringDate: ISODate | null;
  status: string;
  annualOnsite: boolean;
  complianceCheck: boolean;
  targetMonitoringDays: number;
  archived: boolean;
  updatedAt?: string;
}

export interface PrcSchedule {
  id: string;
  presentation: string;
  mostRecent: ISODate | null;
  projectedNext: ISODate | null;
  macro: string;
  act40: string;
  hedgeFund: string;
  private: string;
  newFunds: string;
  updatedAt?: string;
}

export interface PrcArchive {
  id: string;
  meetingDate: ISODate | null;
  macro: string;
  presentation: string;
  act40: string;
  hedgeFund: string;
  private: string;
  newFunds: string;
  sharepointUrl: string;
  updatedAt?: string;
}

export interface CompletedHistoryItem {
  id: string;
  completedDueDate: ISODate | null;
  completedAt: string;
  completedBy: string;
  note: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  analysts: string[];
  label: string;
  dueDate: ISODate | null;
  recurrenceType: string;
  recurrenceInterval: number | null;
  recurrenceUnit: string | null;
  status: TaskStatus;
  sourceModule: string;
  sourceId: string | null;
  completedAt: string | null;
  completedHistory: CompletedHistoryItem[];
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UsefulLink {
  id: string;
  name: string;
  login: string;
  password: string;
  url: string;
  notes: string;
  updatedAt?: string;
}

export interface EntityGlobal {
  name: string;
  flex: boolean;
}
export interface PrcMapping {
  presentations: string[];
  act40Global: EntityGlobal[];
  hedgeFundGlobal: EntityGlobal[];
  privateGlobal: EntityGlobal[];
  map40: Record<string, string[]>;
  mapHF: Record<string, string[]>;
  mapPriv: Record<string, string[]>;
  flexPriv?: string[];
  flexHF?: string[];
}

export interface AimState {
  trips: Trip[];
  monitoring: Monitoring[];
  prcSchedule: PrcSchedule[];
  prcArchive: PrcArchive[];
  prcMapping: PrcMapping;
  tasks: Task[];
  usefulLinks: UsefulLink[];
  monRollover: ISODate | null;
  prefs: { abPeriod: string };
}

export const EMPTY_MAPPING: PrcMapping = {
  presentations: [], act40Global: [], hedgeFundGlobal: [], privateGlobal: [],
  map40: {}, mapHF: {}, mapPriv: {}, flexPriv: [], flexHF: [],
};

/* ─── mappers: Row (snake) -> domain (camel) ─────────────────────────────── */
export const tripFromRow = (r: TripRow): Trip => ({
  id: r.id, section: r.section, date: r.date, days: r.days, city: r.city ?? '',
  analyst: r.analyst ?? '', monitoringVisits: r.monitoring_visits ?? '', event: r.event ?? '',
  flight: r.flight, hotel: r.hotel, car: r.car, notesOtherVisits: r.notes_other_visits ?? '',
  permanent: r.permanent, permanentOriginId: r.permanent_origin_id, updatedAt: r.updated_at,
});
export const monitoringFromRow = (r: MonitoringRow): Monitoring => ({
  id: r.id, fund: r.fund, analyst: r.analyst, level: r.level, mostRecent: r.most_recent,
  monitoringDate: r.monitoring_date, status: r.status, annualOnsite: r.annual_onsite,
  complianceCheck: r.compliance_check, targetMonitoringDays: r.target_monitoring_days,
  archived: r.archived, updatedAt: r.updated_at,
});
export const prcScheduleFromRow = (r: PrcScheduleRow): PrcSchedule => ({
  id: r.id, presentation: r.presentation, mostRecent: r.most_recent, projectedNext: r.projected_next,
  macro: r.macro ?? '', act40: r.act40 ?? '', hedgeFund: r.hedge_fund ?? '', private: r.private ?? '',
  newFunds: r.new_funds ?? '', updatedAt: r.updated_at,
});
export const prcArchiveFromRow = (r: PrcArchiveRow): PrcArchive => ({
  id: r.id, meetingDate: r.meeting_date, macro: r.macro ?? '', presentation: r.presentation ?? '',
  act40: r.act40 ?? '', hedgeFund: r.hedge_fund ?? '', private: r.private ?? '',
  newFunds: r.new_funds ?? '', sharepointUrl: r.sharepoint_url ?? '', updatedAt: r.updated_at,
});
export const taskFromRow = (r: TaskRow): Task => ({
  id: r.id, title: r.title, description: r.description ?? '', analysts: r.analysts,
  label: r.label ?? 'Ad Hoc', dueDate: r.due_date, recurrenceType: r.recurrence_type ?? 'none',
  recurrenceInterval: r.recurrence_interval, recurrenceUnit: r.recurrence_unit,
  status: r.status, sourceModule: r.source_module ?? 'Manual', sourceId: r.source_id,
  completedAt: r.completed_at, completedHistory: (r.completed_history as CompletedHistoryItem[]) ?? [],
  createdBy: '', createdAt: r.created_at, updatedAt: r.updated_at,
});

export const usefulLinkFromRow = (r: UsefulLinkRow): UsefulLink => ({
  id: r.id, name: r.name, login: r.login ?? '', password: r.password ?? '', url: r.url ?? '',
  notes: r.notes ?? '', updatedAt: r.updated_at,
});

/* ─── mappers: domain (camel) -> Row insert/update (snake) ────────────────── */
export const tripToRow = (t: Trip) => ({
  id: t.id, section: t.section, date: t.date, days: t.days, city: t.city, analyst: t.analyst,
  monitoring_visits: t.monitoringVisits, event: t.event, flight: t.flight, hotel: t.hotel,
  car: t.car, notes_other_visits: t.notesOtherVisits, permanent: t.permanent,
  permanent_origin_id: t.permanentOriginId,
});
export const monitoringToRow = (m: Monitoring) => ({
  id: m.id, fund: m.fund, analyst: m.analyst, level: m.level, most_recent: m.mostRecent,
  monitoring_date: m.monitoringDate, status: m.status, annual_onsite: m.annualOnsite,
  compliance_check: m.complianceCheck, target_monitoring_days: m.targetMonitoringDays,
  archived: m.archived,
});
export const prcScheduleToRow = (r: PrcSchedule) => ({
  id: r.id, presentation: r.presentation, most_recent: r.mostRecent, projected_next: r.projectedNext,
  macro: r.macro, act40: r.act40, hedge_fund: r.hedgeFund, private: r.private, new_funds: r.newFunds,
});
export const prcArchiveToRow = (r: PrcArchive) => ({
  id: r.id, meeting_date: r.meetingDate, macro: r.macro, presentation: r.presentation,
  act40: r.act40, hedge_fund: r.hedgeFund, private: r.private, new_funds: r.newFunds,
  sharepoint_url: r.sharepointUrl,
});
export const usefulLinkToRow = (l: UsefulLink) => ({
  id: l.id, name: l.name, login: l.login, password: l.password, url: l.url, notes: l.notes,
});
export const taskToRow = (t: Task) => ({
  id: t.id, title: t.title, description: t.description, analysts: t.analysts, label: t.label,
  due_date: t.dueDate, recurrence_type: t.recurrenceType, recurrence_interval: t.recurrenceInterval,
  recurrence_unit: t.recurrenceUnit, status: t.status, source_module: t.sourceModule,
  source_id: t.sourceId, completed_at: t.completedAt, completed_history: t.completedHistory,
});
