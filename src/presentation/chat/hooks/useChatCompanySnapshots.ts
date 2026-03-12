import { useCallback, useEffect, useReducer, type Dispatch, type SetStateAction } from "react";
import {
  readCompanyRuntimeSnapshot,
  writeCompanyRuntimeSnapshot,
} from "../../../application/company/runtime-snapshot";
import type { RequirementSessionSnapshot } from "../../../domain/mission/requirement-snapshot";

type CompanySnapshotState = {
  companyId: string | null;
  companySessionSnapshots: RequirementSessionSnapshot[];
  hasBootstrappedCompanySync: boolean;
  companySyncStale: boolean;
  companySyncError: string | null;
};

type CompanySnapshotAction =
  | { type: "hydrate"; companyId: string | null }
  | { type: "setSnapshots"; value: SetStateAction<RequirementSessionSnapshot[]> }
  | { type: "setBootstrapped"; value: boolean }
  | { type: "setStale"; value: boolean; error?: string | null };

function createCompanySnapshotState(companyId: string | null): CompanySnapshotState {
  const snapshot = readCompanyRuntimeSnapshot(companyId);
  const companySessionSnapshots = snapshot?.companySessionSnapshots ?? [];
  return {
    companyId,
    companySessionSnapshots,
    hasBootstrappedCompanySync: companySessionSnapshots.length > 0,
    companySyncStale: false,
    companySyncError: null,
  };
}

function reduceCompanySnapshotState(
  state: CompanySnapshotState,
  action: CompanySnapshotAction,
): CompanySnapshotState {
  switch (action.type) {
    case "hydrate":
      return createCompanySnapshotState(action.companyId);
    case "setSnapshots": {
      const nextSnapshots =
        typeof action.value === "function"
          ? action.value(state.companySessionSnapshots)
          : action.value;
      return {
        ...state,
        companySessionSnapshots: nextSnapshots,
      };
    }
    case "setBootstrapped":
      return {
        ...state,
        hasBootstrappedCompanySync: action.value,
      };
    case "setStale":
      return {
        ...state,
        companySyncStale: action.value,
        companySyncError: action.error ?? null,
      };
    default:
      return state;
  }
}

export function useChatCompanySnapshots(
  activeCompanyId: string | null,
): {
  companySessionSnapshots: RequirementSessionSnapshot[];
  hasBootstrappedCompanySync: boolean;
  companySyncStale: boolean;
  companySyncError: string | null;
  setCompanySessionSnapshots: Dispatch<SetStateAction<RequirementSessionSnapshot[]>>;
  setHasBootstrappedCompanySync: (value: boolean) => void;
  setCompanySyncStale: (value: boolean, error?: string | null) => void;
} {
  const [state, dispatch] = useReducer(
    reduceCompanySnapshotState,
    activeCompanyId,
    createCompanySnapshotState,
  );

  useEffect(() => {
    dispatch({ type: "hydrate", companyId: activeCompanyId });
  }, [activeCompanyId]);

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }
    writeCompanyRuntimeSnapshot(activeCompanyId, {
      companySessionSnapshots: state.companySessionSnapshots,
    });
  }, [activeCompanyId, state.companySessionSnapshots]);

  const setCompanySessionSnapshots = useCallback<Dispatch<SetStateAction<RequirementSessionSnapshot[]>>>(
    (value) => {
      dispatch({ type: "setSnapshots", value });
    },
    [],
  );

  const setHasBootstrappedCompanySync = useCallback((value: boolean) => {
    dispatch({ type: "setBootstrapped", value });
  }, []);

  const setCompanySyncStale = useCallback((value: boolean, error?: string | null) => {
    dispatch({ type: "setStale", value, error });
  }, []);

  return {
    companySessionSnapshots: state.companySessionSnapshots,
    hasBootstrappedCompanySync: state.hasBootstrappedCompanySync,
    companySyncStale: state.companySyncStale,
    companySyncError: state.companySyncError,
    setCompanySessionSnapshots,
    setHasBootstrappedCompanySync,
    setCompanySyncStale,
  };
}
