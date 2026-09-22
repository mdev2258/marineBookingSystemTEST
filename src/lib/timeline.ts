import { DECIDED_VIA_LABEL, type DecidedVia } from '@/lib/enums';
import { formatPence } from '@/lib/money';

/**
 * The job's history, derived entirely from rows that already exist -- no
 * events table, nothing to write twice and nothing to drift out of step with
 * what actually happened.
 *
 * Its job is to answer "who agreed what, when, and how" (§7 F3). The HOW is
 * the part that matters: an estimate accepted by link and one agreed on the
 * phone are equally real, and the record says which it was. That is the
 * evidence a trade currently does not have when an owner says "I never
 * agreed to that" in March.
 */
export type TimelineEntry = {
  at: Date;
  label: string;
  detail: string | null;
  /** Owner decisions are the ones worth finding at a glance. */
  emphasis: boolean;
};

type TimelineInput = {
  createdAt: Date;
  estimates: {
    status: string;
    totalPence: number;
    sentAt: Date | null;
    decidedAt: Date | null;
    decidedVia: string | null;
    decisionNote: string | null;
  }[];
  variations: {
    description: string;
    estimatePence: number;
    status: string;
    createdAt: Date;
    decidedAt: Date | null;
    decidedVia: string | null;
    decisionNote: string | null;
  }[];
  emailLogs?: { type: string; subject: string; createdAt: Date; status: string }[];
};

function via(v: string | null): string {
  if (!v) return '';
  return DECIDED_VIA_LABEL[v as DecidedVia] ?? v;
}

export function buildTimeline(job: TimelineInput): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { at: job.createdAt, label: 'Job raised', detail: null, emphasis: false },
  ];

  for (const e of job.estimates) {
    if (e.sentAt) {
      entries.push({
        at: e.sentAt,
        label: `Estimate sent — ${formatPence(e.totalPence)}`,
        detail: null,
        emphasis: false,
      });
    }
    if (e.decidedAt && (e.status === 'accepted' || e.status === 'declined')) {
      entries.push({
        at: e.decidedAt,
        label: `Estimate ${e.status} — ${via(e.decidedVia)}`,
        detail: e.decisionNote,
        emphasis: true,
      });
    }
  }

  for (const v of job.variations) {
    entries.push({
      at: v.createdAt,
      label: `Extra work raised — ${formatPence(v.estimatePence)}`,
      detail: v.description,
      emphasis: false,
    });
    if (v.decidedAt && v.status !== 'awaiting_owner') {
      entries.push({
        at: v.decidedAt,
        label: `Extra work ${v.status}${v.decidedVia ? ` — ${via(v.decidedVia)}` : ''}`,
        detail: v.decisionNote ?? v.description,
        emphasis: true,
      });
    }
  }

  // Emails are the proof that the owner was actually told, which is a
  // different claim from "we decided something".
  for (const log of job.emailLogs ?? []) {
    if (log.status !== 'sent') continue;
    entries.push({
      at: log.createdAt,
      label: 'Emailed the owner',
      detail: log.subject,
      emphasis: false,
    });
  }

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}
