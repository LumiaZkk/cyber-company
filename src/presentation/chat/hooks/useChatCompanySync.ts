import { useEffect, type MutableRefObject } from "react";
import type { RequirementSessionSnapshot } from "../../../domain/mission/requirement-snapshot";

export function useChatCompanySync(input: {
  shouldRun: boolean;
  intervalMs: number;
  companySessionSnapshotsRef: MutableRefObject<RequirementSessionSnapshot[]>;
  syncCompanyCommunication: (options?: { force?: boolean }) => Promise<unknown>;
  setHasBootstrappedCompanySync: (value: boolean) => void;
  setCompanySyncStale: (value: boolean, error?: string | null) => void;
}) {
  const {
    shouldRun,
    intervalMs,
    companySessionSnapshotsRef,
    syncCompanyCommunication,
    setHasBootstrappedCompanySync,
    setCompanySyncStale,
  } = input;

  useEffect(() => {
    if (!shouldRun) {
      return;
    }

    let cancelled = false;
    let inFlight = false;
    const run = async () => {
      if (cancelled || inFlight) {
        return;
      }
      inFlight = true;

      try {
        if (!cancelled) {
          await syncCompanyCommunication({
            force: companySessionSnapshotsRef.current.length === 0,
          });
          setHasBootstrappedCompanySync(true);
          setCompanySyncStale(false, null);
        }
      } catch (error) {
        console.error("background company sync failed", error);
        if (!cancelled) {
          setCompanySyncStale(
            true,
            error instanceof Error ? error.message : String(error),
          );
        }
      } finally {
        inFlight = false;
      }
    };

    void run();
    const timer = window.setInterval(() => {
      void run();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    companySessionSnapshotsRef,
    intervalMs,
    setCompanySyncStale,
    setHasBootstrappedCompanySync,
    shouldRun,
    syncCompanyCommunication,
  ]);
}
