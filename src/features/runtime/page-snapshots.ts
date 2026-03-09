const pageSnapshots = new Map<string, unknown>();

export function readPageSnapshot<T>(key: string): T | null {
  return (pageSnapshots.get(key) as T | undefined) ?? null;
}

export function writePageSnapshot<T>(key: string, value: T): void {
  pageSnapshots.set(key, value);
}

export function clearPageSnapshot(key: string): void {
  pageSnapshots.delete(key);
}
