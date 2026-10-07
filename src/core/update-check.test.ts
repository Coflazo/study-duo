import { describe, expect, it } from 'vitest';
import { updateWaiting } from './update-check';

const running = { manifest_version: 3, name: 'Study Duo', version: '0.0.1', version_name: '0.0.1 1a2b3c4', permissions: ['storage', 'alarms'] };

describe('updateWaiting', () => {
  it('stays quiet when the files on disk are the copy that is running', () => {
    expect(updateWaiting(running, structuredClone(running))).toBe(false);
  });

  it('notices a newer build, a new version or a new permission on disk', () => {
    expect(updateWaiting(running, { ...running, version_name: '0.0.1 5d6e7f8' })).toBe(true);
    expect(updateWaiting(running, { ...running, version: '0.1.0' })).toBe(true);
    expect(updateWaiting(running, { ...running, permissions: ['storage', 'alarms', 'scripting'] })).toBe(true);
  });

  it('says nothing about a file it cannot read', () => {
    expect(updateWaiting(running, null)).toBe(false);
    expect(updateWaiting(running, 'not json')).toBe(false);
    expect(updateWaiting(running, { name: 'Study Duo' })).toBe(false);
  });
});
