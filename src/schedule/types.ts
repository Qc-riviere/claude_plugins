export interface Schedule {
  name: string;
  cron_expr: string;
  command: string;
  enabled: boolean;
  last_run?: string;
  project?: string;
}
