import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Convex AI guidelines forbid the `hourly`/`daily`/`weekly` helpers.
// Use `cron` with a standard expression: "minute hour day month weekday".
// "0 * * * *" = top of every hour (UTC).
crons.cron(
  "poll-active-campaigns",
  "0 * * * *",
  internal.crons.pollReddit.tick,
  {},
);

export default crons;
