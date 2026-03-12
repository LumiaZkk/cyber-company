import { describe, expect, it, vi } from "vitest";
import { createManagedFileMirrorQueue, type ManagedExecutorFileInput } from "./managed-file-mirror";

function createDeferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createManagedFileMirrorQueue", () => {
  it("serializes writes for the same agent file", async () => {
    const first = createDeferred();
    const second = createDeferred();
    const firstStarted = createDeferred();
    const secondStarted = createDeferred();
    const started: string[] = [];
    const finished: string[] = [];
    let callIndex = 0;

    const queue = createManagedFileMirrorQueue(async (file) => {
      callIndex += 1;
      started.push(`${callIndex}:${file.content}`);
      if (callIndex === 1) {
        firstStarted.resolve();
        await first.promise;
      } else {
        secondStarted.resolve();
        await second.promise;
      }
      finished.push(`${callIndex}:${file.content}`);
    });

    const firstRun = queue.sync({ agentId: "ceo", name: "company-context.json", content: "first" });
    const secondRun = queue.sync({ agentId: "ceo", name: "company-context.json", content: "second" });

    await firstStarted.promise;
    expect(started).toEqual(["1:first"]);

    first.resolve();
    await firstRun;
    await secondStarted.promise;
    expect(started).toEqual(["1:first", "2:second"]);

    second.resolve();
    await secondRun;
    expect(finished).toEqual(["1:first", "2:second"]);
  });

  it("allows different files to sync independently", async () => {
    const writes: ManagedExecutorFileInput[] = [];
    const queue = createManagedFileMirrorQueue(async (file) => {
      writes.push(file);
    });

    await Promise.all([
      queue.sync({ agentId: "ceo", name: "company-context.json", content: "a" }),
      queue.sync({ agentId: "cto", name: "department-context.json", content: "b" }),
    ]);

    expect(writes).toEqual([
      { agentId: "ceo", name: "company-context.json", content: "a" },
      { agentId: "cto", name: "department-context.json", content: "b" },
    ]);
  });

  it("continues processing the same file after a failed write", async () => {
    const writeFile = vi.fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    const queue = createManagedFileMirrorQueue(writeFile);

    await expect(queue.sync({ agentId: "ceo", name: "company-context.json", content: "first" })).rejects.toThrow("boom");
    await expect(queue.sync({ agentId: "ceo", name: "company-context.json", content: "second" })).resolves.toBeUndefined();

    expect(writeFile.mock.calls).toEqual([
      [{ agentId: "ceo", name: "company-context.json", content: "first" }],
      [{ agentId: "ceo", name: "company-context.json", content: "second" }],
    ]);
  });
});
