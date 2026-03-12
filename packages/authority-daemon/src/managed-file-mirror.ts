export type ManagedExecutorFileInput = {
  agentId: string;
  name: string;
  content: string;
};

function toManagedFileKey(file: Pick<ManagedExecutorFileInput, "agentId" | "name">) {
  return `${file.agentId}:${file.name}`;
}

export function createManagedFileMirrorQueue(
  writeFile: (file: ManagedExecutorFileInput) => Promise<unknown>,
) {
  const tails = new Map<string, Promise<void>>();

  return {
    sync(file: ManagedExecutorFileInput) {
      const key = toManagedFileKey(file);
      const previous = tails.get(key) ?? Promise.resolve();
      const current = previous
        .catch(() => undefined)
        .then(async () => {
          await writeFile(file);
        });

      let tail: Promise<void>;
      tail = current
        .then(() => undefined, () => undefined)
        .finally(() => {
          if (tails.get(key) === tail) {
            tails.delete(key);
          }
        });

      tails.set(key, tail);
      return current;
    },
  };
}
