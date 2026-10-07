interface ManifestLike {
  version?: unknown;
  version_name?: unknown;
  permissions?: unknown;
}

/**
 * True when the extension's files on disk are newer than the copy Chrome is running: Chrome reads unpacked pages from
 * disk but keeps the old background, manifest and permissions until the extension reloads. A file that cannot be read
 * or is not a manifest is no evidence of anything.
 */
export function updateWaiting(running: ManifestLike, onDisk: unknown): boolean {
  if (onDisk === null || typeof onDisk !== 'object') return false;
  const disk = onDisk as ManifestLike;
  if (typeof disk.version !== 'string') return false;
  return (
    disk.version !== running.version ||
    disk.version_name !== running.version_name ||
    JSON.stringify(disk.permissions ?? []) !== JSON.stringify(running.permissions ?? [])
  );
}
