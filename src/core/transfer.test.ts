import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';
import type { Todo } from './todos';
import { buildBundle, decodeBundle, encodeBundle, FrameCollector, mergeTodos, parseBundle, toFrames } from './transfer';

const todos: Todo[] = [
  { id: 't1', text: 'Statistics problem set 4', course: 'STAT101', done: false, doneAt: null, ifThen: 'If I get stuck, I will reread the notes' },
  { id: 't2', text: 'Read lecture 5 notes', course: null, done: true, doneAt: 1_800_000_000_000, ifThen: null, due: 1_800_100_000_000, feedUid: 'event-assignment-3' },
];
const bundle = buildBundle({ settings: { ...DEFAULT_SETTINGS, focusMin: 50 }, sites: { 'youtube.com': 'blocked', 'canvas.uva.nl': 'study' }, todos }, 1_800_000_000_000);

describe('bundles', () => {
  it('survive compression and come back identical', async () => {
    const text = await encodeBundle(bundle);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeBundle(text)).toEqual(bundle);
  });

  it('are refused when they are not a Study Duo move, too new, too big or broken', async () => {
    expect(parseBundle({ ...bundle, app: 'other' })).toBeNull();
    expect(parseBundle({ ...bundle, version: 2 })).toBeNull();
    expect(parseBundle('nonsense')).toBeNull();
    await expect(decodeBundle('not-deflate-data')).resolves.toBeNull();
    await expect(decodeBundle('A'.repeat(2_000_000))).resolves.toBeNull();
  });

  it('clean what they carry with the same rules as storage', () => {
    const parsed = parseBundle({ ...bundle, settings: { ...bundle.settings, focusMin: 9999 }, sites: { 'bad host!': 'blocked', 'ok.example': 'study' }, todos: [...todos, { id: '', text: 'x' }] })!;
    expect(parsed.settings.focusMin).toBeLessThanOrEqual(180);
    expect(Object.keys(parsed.sites)).toEqual(['ok.example']);
    expect(parsed.todos.map((t) => t.id)).toEqual(['t1', 't2']);
  });
});

describe('QR frames', () => {
  it('split a long text and collect it back in any order, with repeats', async () => {
    const text = await encodeBundle(buildBundle({ settings: DEFAULT_SETTINGS, sites: {}, todos: Array.from({ length: 80 }, (_, i) => ({ ...todos[0]!, id: `t${i}`, text: `Task number ${i} with some words to make it longer` })) }, 1));
    const frames = toFrames(text, 'ab12', 300);
    expect(frames.length).toBeGreaterThan(1);
    expect(frames.every((f) => f.length <= 300 + 20)).toBe(true);
    const c = new FrameCollector();
    const shuffled = [...frames].reverse();
    for (const f of [...shuffled, ...shuffled]) c.add(f);
    expect(c.progress()).toEqual({ have: frames.length, of: frames.length });
    expect(c.text()).toBe(text);
  });

  it('ignore frames from another transfer or another app', () => {
    const c = new FrameCollector();
    c.add('SD1:aaaa:1/2:hello');
    c.add('SD1:bbbb:2/2:world'); // a second transfer started: the collector follows the first one it saw
    c.add('https://example.com');
    c.add('SD1:aaaa:9/2:x');
    expect(c.progress()).toEqual({ have: 1, of: 2 });
    expect(c.text()).toBeNull();
    c.add('SD1:aaaa:2/2: world');
    expect(c.text()).toBe('hello world');
  });
});

describe('mergeTodos', () => {
  it('adds the moved to-dos after the ones here, skipping ids already present', () => {
    const here: Todo[] = [{ ...todos[0]!, text: 'Edited here' }];
    expect(mergeTodos(here, todos).map((t) => [t.id, t.text])).toEqual([['t1', 'Edited here'], ['t2', 'Read lecture 5 notes']]);
  });
});
