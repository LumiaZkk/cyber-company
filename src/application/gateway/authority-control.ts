import { gateway } from "./index";
import type {
  AuthorityAppendRoomRequest,
  AuthorityArtifactDeleteRequest,
  AuthorityArtifactMirrorSyncRequest,
  AuthorityArtifactUpsertRequest,
  AuthorityDispatchUpsertRequest,
  AuthorityDispatchDeleteRequest,
  AuthorityRequirementPromoteRequest,
  AuthorityRequirementTransitionRequest,
  AuthorityRoomDeleteRequest,
  AuthorityRoomBindingsUpsertRequest,
  AuthorityBootstrapSnapshot,
  AuthorityCompanyRuntimeSnapshot,
  AuthorityCreateCompanyRequest,
  AuthorityCreateCompanyResponse,
  AuthorityExecutorConfig,
  AuthorityExecutorConfigPatch,
  AuthorityHireEmployeeRequest,
  AuthorityHireEmployeeResponse,
} from "../../infrastructure/authority/contract";

export function getAuthorityBootstrap() {
  return gateway.request<AuthorityBootstrapSnapshot>("authority.bootstrap");
}

export function saveAuthorityConfig(config: AuthorityBootstrapSnapshot["config"]) {
  return gateway.request<AuthorityBootstrapSnapshot>("authority.config.save", { config });
}

export function createAuthorityCompany(input: AuthorityCreateCompanyRequest) {
  return gateway.request<AuthorityCreateCompanyResponse>("authority.company.create", input);
}

export function hireAuthorityEmployee(input: AuthorityHireEmployeeRequest) {
  return gateway.request<AuthorityHireEmployeeResponse>("authority.company.employee.hire", input);
}

export function switchAuthorityCompany(companyId: string) {
  return gateway.request<AuthorityBootstrapSnapshot>("authority.company.switch", { companyId });
}

export function deleteAuthorityCompany(companyId: string) {
  return gateway.request<AuthorityBootstrapSnapshot>("authority.company.delete", { companyId });
}

export function getAuthorityCompanyRuntime(companyId: string) {
  return gateway.request<AuthorityCompanyRuntimeSnapshot>("authority.company.runtime.get", { companyId });
}

export function syncAuthorityCompanyRuntime(snapshot: AuthorityCompanyRuntimeSnapshot) {
  return gateway.request<AuthorityCompanyRuntimeSnapshot>("authority.company.runtime.sync", {
    companyId: snapshot.companyId,
    snapshot,
  });
}

export function transitionAuthorityRequirement(input: AuthorityRequirementTransitionRequest) {
  return gateway.request<AuthorityCompanyRuntimeSnapshot>("authority.requirement.transition", input);
}

export function promoteAuthorityRequirement(input: AuthorityRequirementPromoteRequest) {
  return gateway.request<AuthorityCompanyRuntimeSnapshot>("authority.requirement.promote", input);
}

export function appendAuthorityRoom(input: AuthorityAppendRoomRequest) {
  return gateway.request<AuthorityCompanyRuntimeSnapshot>("authority.room.append", input);
}

export function upsertAuthorityRoomBindings(input: AuthorityRoomBindingsUpsertRequest) {
  return gateway.request<AuthorityCompanyRuntimeSnapshot>("authority.room-bindings.upsert", input);
}

export function deleteAuthorityRoom(input: AuthorityRoomDeleteRequest) {
  return gateway.request<AuthorityCompanyRuntimeSnapshot>("authority.room.delete", input);
}

export function upsertAuthorityDispatch(input: AuthorityDispatchUpsertRequest) {
  return gateway.request<AuthorityCompanyRuntimeSnapshot>("authority.dispatch.create", input);
}

export function deleteAuthorityDispatch(input: AuthorityDispatchDeleteRequest) {
  return gateway.request<AuthorityCompanyRuntimeSnapshot>("authority.dispatch.delete", input);
}

export function upsertAuthorityArtifact(input: AuthorityArtifactUpsertRequest) {
  return gateway.request<AuthorityCompanyRuntimeSnapshot>("authority.artifact.upsert", input);
}

export function syncAuthorityArtifactMirrors(input: AuthorityArtifactMirrorSyncRequest) {
  return gateway.request<AuthorityCompanyRuntimeSnapshot>("authority.artifact.sync-mirror", input);
}

export function deleteAuthorityArtifact(input: AuthorityArtifactDeleteRequest) {
  return gateway.request<AuthorityCompanyRuntimeSnapshot>("authority.artifact.delete", input);
}

export function getAuthorityExecutorConfig() {
  return gateway.request<AuthorityExecutorConfig>("authority.executor.get");
}

export function patchAuthorityExecutorConfig(patch: AuthorityExecutorConfigPatch) {
  return gateway.request<AuthorityExecutorConfig>("authority.executor.patch", patch);
}
