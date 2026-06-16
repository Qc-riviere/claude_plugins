import parser from "cron-parser";

export function computeNextRun(
  cronExpr: string,
  from: Date = new Date(),
): string | null {
  try {
    const it = parser.parseExpression(cronExpr, { currentDate: from, utc: true });
    return it.next().toDate().toISOString();
  } catch {
    return null;
  }
}
