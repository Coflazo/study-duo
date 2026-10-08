import { clockTime } from './today-view';

const DAY = 86_400_000;
const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0);

/** "Due tomorrow 23:59", "Due Fri 16 Oct", "Was due yesterday 23:59"; soon when less than a day is left or it passed. */
export function dueLabel(due: number, now: number): { text: string; soon: boolean } {
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  const time = clockTime(due);
  const endOfDay = new Date(due).getHours() === 23 && new Date(due).getMinutes() === 59;
  const when =
    days === 0 ? `today ${time}`
    : days === 1 ? `tomorrow ${time}`
    : days === -1 ? `yesterday ${time}`
    : `${new Date(due).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}${endOfDay && days > 0 ? '' : ` ${time}`}`;
  return { text: `${due < now ? 'Was due' : 'Due'} ${when}`, soon: due - now < DAY };
}
