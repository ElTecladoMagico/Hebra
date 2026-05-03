import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { utcDateKey } from "../usage";

export const TRIPWIRE_USD_CENTS = 500;
export const KILL_USD_CENTS = 5000;

export class CostKillSwitchError extends Error {
  constructor(public totalCents: number) {
    super(
      `Cost kill switch engaged — daily total ${totalCents} cents exceeds ${KILL_USD_CENTS}`
    );
    this.name = "CostKillSwitchError";
  }
}

export async function ensureCostGuardOk(ctx: ActionCtx, op: string): Promise<void> {
  const today = utcDateKey(Date.now());
  const total = await ctx.runQuery(internal.usage.totalCostToday, { dateKey: today });

  if (total >= KILL_USD_CENTS) {
    await ctx.runMutation(internal.errorLog.insert, {
      service: "costGuard",
      operation: op,
      errorMessage: `KILL: daily cost ${total} cents exceeds ${KILL_USD_CENTS}`,
      severity: "critical",
    });
    throw new CostKillSwitchError(total);
  }

  if (total >= TRIPWIRE_USD_CENTS) {
    await ctx.runMutation(internal.campaigns.pauseAllActive, {});
    await ctx.runMutation(internal.errorLog.insert, {
      service: "costGuard",
      operation: op,
      errorMessage: `TRIPWIRE: daily cost ${total} cents exceeds ${TRIPWIRE_USD_CENTS}`,
      severity: "warn",
    });
  }
}
