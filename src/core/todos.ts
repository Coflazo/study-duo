export interface Todo {
  id: string;
  text: string;
  /** Short course tag shown beside the item, like STAT101. */
  course: string | null;
  done: boolean;
  doneAt: number | null;
  /** Optional if-then plan for when the block gets hard ("If I get stuck, I will..."). */
  ifThen: string | null;
  /** When it is due, epoch ms; set for deadlines from a course calendar. */
  due?: number;
  /** The calendar event this to-do came from, so later checks update it instead of adding it again. */
  feedUid?: string;
}

export const todosItem = storage.defineItem<Todo[]>('local:todos', { fallback: [] });

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim().slice(0, max).trim();
  return s.length > 0 ? s : null;
};
const course = (v: unknown) => text(typeof v === 'string' ? v.toUpperCase() : v, 12);

type Draft = { text: string; course?: string | null; ifThen?: string | null };

export function addTodo(list: Todo[], draft: Draft, id: string): Todo[] {
  const t = text(draft.text, 200);
  if (t === null) return list;
  return [...list, { id, text: t, course: course(draft.course), done: false, doneAt: null, ifThen: text(draft.ifThen, 160) }];
}

export function editTodo(list: Todo[], id: string, patch: Partial<Draft>): Todo[] {
  return list.map((x) => {
    if (x.id !== id) return x;
    const t = patch.text === undefined ? x.text : (text(patch.text, 200) ?? x.text);
    return {
      ...x,
      text: t,
      course: patch.course === undefined ? x.course : course(patch.course),
      ifThen: patch.ifThen === undefined ? x.ifThen : text(patch.ifThen, 160),
    };
  });
}

export function toggleTodo(list: Todo[], id: string, now: number): Todo[] {
  return list.map((x) => (x.id === id ? { ...x, done: !x.done, doneAt: x.done ? null : now } : x));
}

export function moveTodo(list: Todo[], id: string, toIndex: number): Todo[] {
  const from = list.findIndex((x) => x.id === id);
  if (from < 0) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, toIndex)), 0, item!);
  return next;
}

/** Move up or down among the open items only, so done items in between never swallow the move. */
export function moveAmongOpen(list: Todo[], id: string, step: -1 | 1): Todo[] {
  const open = list.filter((x) => !x.done);
  const neighbour = open[open.findIndex((x) => x.id === id) + step];
  return neighbour ? moveTodo(list, id, list.indexOf(neighbour)) : list;
}

export function removeTodo(list: Todo[], id: string): Todo[] {
  return list.filter((x) => x.id !== id);
}

/** To-dos come from storage or an import file; keep valid items, drop the rest. */
export function normalizeTodos(raw: unknown): Todo[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Todo[] = [];
  for (const r of raw) {
    if (r === null || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const id = typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 64 ? o.id : null;
    const t = text(o.text, 200);
    if (id === null || t === null || seen.has(id)) continue;
    seen.add(id);
    const done = o.done === true;
    const item: Todo = { id, text: t, course: course(o.course), done, doneAt: done && typeof o.doneAt === 'number' ? o.doneAt : null, ifThen: text(o.ifThen, 160) };
    if (typeof o.due === 'number' && Number.isFinite(o.due)) item.due = o.due;
    if (typeof o.feedUid === 'string' && o.feedUid.length > 0 && o.feedUid.length <= 200) item.feedUid = o.feedUid;
    out.push(item);
  }
  return out;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Applies one change to the latest stored list. Changes from the same page run one at a time; between pages
 * each write re-reads first, so only changes landing in the same instant could collide.
 */
export function updateTodos(change: (list: Todo[]) => Todo[]): Promise<Todo[]> {
  const run = queue.then(async () => {
    // normalizeTodos rebuilds plain objects: a Svelte proxy would fail Firefox's structured clone.
    const next = normalizeTodos(change(normalizeTodos(await todosItem.getValue())));
    await todosItem.setValue(next);
    return next;
  });
  queue = run.catch(() => undefined);
  return run;
}
