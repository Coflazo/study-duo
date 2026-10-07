import type { ActivityRecord, BlockedAttempt } from './db';
import { recordsBetween } from './log';
import { sessionsBetween, type SessionRecord } from './sessions';
import type { Measure } from './settings';

const MIN = 60_000;
/** A break that ended longer ago than this says nothing about how fast the next block started. */
const RECENT_BREAK_MS = 2 * 60 * MIN;

/** The quiet focus signals of one study block (spec: Implicit focus signals). Absent means switched off or too little data. */
export interface BlockSignals {
  /** Share of observed time on Study sites, 0 to 1. Time away from the browser is left out, not counted against. */
  studyShare?: number;
  /** Switches to Blocked or unfiled sites per hour of block time. */
  offSwitchesPerHour?: number;
  blockedAttempts?: number;
  unlocks?: number;
  /** Longest unbroken stretch on Study sites. */
  longestStudyMin?: number;
  unobservedMin?: number;
  pausedMin?: number;
  extendedMin?: number;
  /** 1 when the block ran to its end, 0 when it was skipped or reset. */
  completed?: number;
  /** Minutes between the end of the last break and the start of this block. */
  startDelayMin?: number;
  /** Opt-in: share of active minutes with any typing, clicking or scrolling. */
  inputShare?: number;
}

export interface BlockInput {
  block: SessionRecord;
  activity: ActivityRecord[];
  blocks: BlockedAttempt[];
  /** The session that ended last before this block started. */
  previous: SessionRecord | null;
  measure: Measure;
}

export function blockSignals({ block, activity, blocks, previous, measure }: BlockInput): BlockSignals {
  const { startedAt: from, endedAt: to } = block;
  const inBlock = activity
    .filter((r) => r.phase === 'focus' && r.endedAt > from && r.startedAt < to)
    .map((r) => ({ ...r, startedAt: Math.max(r.startedAt, from), endedAt: Math.min(r.endedAt, to) }))
    .sort((x, y) => x.startedAt - y.startedAt);
  const ms = (rs: typeof inBlock) => rs.reduce((sum, r) => sum + (r.endedAt - r.startedAt), 0);
  const out: BlockSignals = {};

  if (measure.sites) {
    const observed = ms(inBlock.filter((r) => r.category !== 'unobserved'));
    if (observed >= MIN) out.studyShare = ms(inBlock.filter((r) => r.category === 'study')) / observed;
    if (block.activeMs >= MIN) out.offSwitchesPerHour = inBlock.filter((r) => r.category === 'blocked' || r.category === 'unfiled').length / (block.activeMs / (60 * MIN));
    let longest = 0;
    let run = 0;
    let runEnd = -Infinity;
    for (const r of inBlock) {
      if (r.category !== 'study') {
        run = 0;
        continue;
      }
      run = r.startedAt - runEnd <= 1000 ? run + (r.endedAt - r.startedAt) : r.endedAt - r.startedAt;
      runEnd = r.endedAt;
      longest = Math.max(longest, run);
    }
    out.longestStudyMin = longest / MIN;
  }
  if (measure.blocked) {
    const tried = blocks.filter((b) => b.at >= from && b.at < to);
    out.blockedAttempts = tried.length;
    out.unlocks = tried.filter((b) => b.unlocked).length;
  }
  const counted = inBlock.filter((r) => r.inputMinutes !== undefined);
  if (measure.input && counted.length > 0 && block.activeMs >= MIN) {
    out.inputShare = Math.min(1, counted.reduce((sum, r) => sum + (r.inputMinutes ?? 0), 0) / (block.activeMs / MIN));
  }
  if (measure.away) out.unobservedMin = ms(inBlock.filter((r) => r.category === 'unobserved')) / MIN;
  if (measure.outcome) {
    out.pausedMin = block.pausedMs / MIN;
    out.extendedMin = (block.extendedMs ?? 0) / MIN;
    out.completed = block.completed ? 1 : 0;
    if (previous && previous.phase !== 'focus' && previous.endedAt <= from && from - previous.endedAt <= RECENT_BREAK_MS) {
      out.startDelayMin = (from - previous.endedAt) / MIN;
    }
  }
  return out;
}

/** Signals for every study block that ended in [from, to), worked out from the stored log when needed. */
export async function signalsBetween(from: number, to: number, measure: Measure): Promise<Array<{ block: SessionRecord; signals: BlockSignals }>> {
  const lookBack = from - RECENT_BREAK_MS - 4 * 60 * MIN; // the break before the first block, and blocks that started earlier
  const [sessions, activity, blocks] = await Promise.all([sessionsBetween(lookBack, to), recordsBetween('activity', lookBack, to), recordsBetween('blocks', lookBack, to)]);
  sessions.sort((x, y) => x.endedAt - y.endedAt);
  return sessions
    .map((block, i) => ({ block, previous: sessions[i - 1] ?? null }))
    .filter(({ block }) => block.phase === 'focus' && block.endedAt >= from)
    .map(({ block, previous }) => ({ block, signals: blockSignals({ block, activity, blocks, previous, measure }) }));
}
