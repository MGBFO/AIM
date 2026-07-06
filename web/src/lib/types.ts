/* ============================================================================
   Database types. Hand-written for the scaffold; once the schema stabilizes,
   regenerate with `supabase gen types typescript --local > src/lib/types.ts`.
   Mirrors supabase/migrations/0001_init.sql.
   ========================================================================== */

export type UUID = string;
export type ISODate = string; // "yyyy-mm-dd"
export type Timestamptz = string;

export type Role = 'admin' | 'analyst';
export type TripSection = 'upcoming' | 'potential' | 'archived';
export type MonitoringLevel = 'Level 1' | 'Level 2' | 'Level 3';
export type TaskStatus = 'open' | 'completed';
export type ActionOp = 'insert' | 'update' | 'delete';

interface AuditCols {
  id: UUID;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  updated_by: UUID | null;
}

export interface UserRow {
  id: UUID; // = auth.users.id
  display_name: string;
  role: Role;
  analyst_code: string | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

export interface TripRow extends AuditCols {
  section: TripSection;
  date: ISODate | null;
  days: number | null;
  city: string | null;
  analyst: string | null; // raw multi-analyst code preserved (slash-joined)
  monitoring_visits: string | null;
  event: string | null;
  flight: number | null;
  hotel: number | null;
  car: number | null;
  notes_other_visits: string | null;
  permanent: boolean;
  permanent_origin_id: UUID | null;
}

export interface MonitoringRow extends AuditCols {
  fund: string;
  analyst: string;
  level: MonitoringLevel;
  most_recent: ISODate | null;
  monitoring_date: ISODate | null;
  status: string;
  annual_onsite: boolean;
  compliance_check: boolean;
  target_monitoring_days: number;
  archived: boolean;
}

export interface PrcScheduleRow extends AuditCols {
  presentation: string;
  most_recent: ISODate | null;
  projected_next: ISODate | null;
  macro: string | null;
  act40: string | null;
  hedge_fund: string | null;
  private: string | null;
  new_funds: string | null;
}

export interface PrcArchiveRow extends AuditCols {
  meeting_date: ISODate | null;
  macro: string | null;
  presentation: string | null;
  act40: string | null;
  hedge_fund: string | null;
  private: string | null;
  new_funds: string | null;
  sharepoint_url: string | null;
}

export interface PrcConfigRow extends AuditCols {
  key: string;
  value: unknown; // jsonb: entities grid / mapping object
}

export interface TaskRow extends AuditCols {
  title: string;
  description: string | null;
  analysts: string[];
  label: string | null;
  due_date: ISODate | null;
  recurrence_type: string | null;
  recurrence_interval: number | null;
  recurrence_unit: string | null;
  status: TaskStatus;
  source_module: string | null;
  source_id: string | null;
  completed_at: Timestamptz | null;
  completed_history: unknown; // jsonb[]
  created_by: UUID | null;
}

export interface UsefulLinkRow extends AuditCols {
  name: string;
  login: string | null;
  password: string | null;
  url: string | null;
  notes: string | null;
}

export interface ActionLogRow {
  id: UUID;
  user_id: UUID;
  table_name: string;
  row_id: UUID;
  op: ActionOp;
  before: unknown;
  after: unknown;
  created_at: Timestamptz;
}

export interface AppConfigRow {
  key: string;
  value: unknown;
  updated_at: Timestamptz;
  updated_by: UUID | null;
}

type TableDef<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
};

export interface Database {
  public: {
    Tables: {
      users: TableDef<UserRow>;
      trips: TableDef<TripRow>;
      monitoring: TableDef<MonitoringRow>;
      prc_schedule: TableDef<PrcScheduleRow>;
      prc_archive: TableDef<PrcArchiveRow>;
      prc_config: TableDef<PrcConfigRow>;
      tasks: TableDef<TaskRow>;
      useful_links: TableDef<UsefulLinkRow>;
      action_log: TableDef<ActionLogRow>;
      app_config: TableDef<AppConfigRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      role: Role;
      trip_section: TripSection;
      monitoring_level: MonitoringLevel;
      task_status: TaskStatus;
      action_op: ActionOp;
    };
  };
}
