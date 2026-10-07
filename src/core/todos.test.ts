import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addTodo, editTodo, moveTodo, normalizeTodos, removeTodo, todosItem, toggleTodo, updateTodos, type Todo } from './todos';

const t = (id: string, text = id): Todo => ({ id, text, course: null, done: false, doneAt: null, ifThen: null });

beforeEach(() => fakeBrowser.reset());

describe('to-do list operations', () => {
  it('adds at the end with a cleaned course tag and plan', () => {
    const list = addTodo([t('a')], { text: '  Read lecture 5 notes ', course: ' linalg ', ifThen: ' If I get stuck, I will skim the summary first. ' }, 'b');
    expect(list.map((x) => x.id)).toEqual(['a', 'b']);
    expect(list[1]).toEqual({ id: 'b', text: 'Read lecture 5 notes', course: 'LINALG', done: false, doneAt: null, ifThen: 'If I get stuck, I will skim the summary first.' });
  });

  it('refuses an empty item and trims long ones', () => {
    expect(addTodo([], { text: '   ' }, 'x')).toEqual([]);
    expect(addTodo([], { text: 'x'.repeat(300) }, 'x')[0]!.text).toHaveLength(200);
  });

  it('edits, completes, reopens, moves and removes', () => {
    let list = [t('a'), t('b'), t('c')];
    list = editTodo(list, 'b', { text: 'Problem set 4', course: 'stat101' });
    expect(list[1]).toMatchObject({ text: 'Problem set 4', course: 'STAT101' });
    list = toggleTodo(list, 'b', 1000);
    expect(list[1]).toMatchObject({ done: true, doneAt: 1000 });
    list = toggleTodo(list, 'b', 2000);
    expect(list[1]).toMatchObject({ done: false, doneAt: null });
    expect(moveTodo(list, 'c', 0).map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(moveTodo(list, 'a', 99).map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(removeTodo(list, 'a').map((x) => x.id)).toEqual(['b', 'c']);
    expect(editTodo(list, 'b', { text: '  ' })[1]!.text).toBe('Problem set 4');
  });
});

describe('normalizeTodos', () => {
  it('keeps what is valid from stored data and drops the rest', () => {
    const raw = [t('a'), { id: 'b', text: '' }, { nope: 1 }, t('a'), 'string', { ...t('c'), course: 'way too long course tag', done: 'yes' }];
    expect(normalizeTodos(raw)).toEqual([t('a'), { ...t('c'), course: 'WAY TOO LONG' }]);
    expect(normalizeTodos(null)).toEqual([]);
  });
});

describe('updateTodos', () => {
  it('applies one change to the latest stored list, so two open pages do not overwrite each other', async () => {
    await todosItem.setValue([t('a')]);
    const fromPopup = updateTodos((list) => addTodo(list, { text: 'from popup' }, 'p'));
    const fromDashboard = updateTodos((list) => addTodo(list, { text: 'from dashboard' }, 'd'));
    await Promise.all([fromPopup, fromDashboard]);
    expect((await todosItem.getValue()).map((x) => x.id).sort()).toEqual(['a', 'd', 'p']);
  });
});
