import type { EmployeeRef } from "../company/types";
import type { ActorRef, ConversationKind, ConversationRef, ProviderManifest } from "./types";

export type VirtualActorProfile = {
  actorId: string;
  label: string;
  role: string;
  prompt: string;
  memoryNamespace: string;
  backingActorId: string;
};

export function buildVirtualActorProfiles(input: {
  providerId: string;
  executorActorId: string;
  employees: EmployeeRef[];
}): VirtualActorProfile[] {
  const { employees, executorActorId } = input;
  return employees.map((employee) => ({
    actorId: employee.agentId,
    label: employee.nickname || employee.role || employee.agentId,
    role: employee.role || employee.departmentId || "成员",
    prompt: `你当前扮演 ${employee.nickname || employee.agentId}（${employee.role || "成员"}）。请以该角色的职责和语气完成任务。`,
    memoryNamespace: `virtual:${employee.agentId}`,
    backingActorId: executorActorId,
  }));
}

export function toVirtualActorRef(input: {
  providerId: string;
  profile: VirtualActorProfile;
}): ActorRef {
  return {
    providerId: input.providerId,
    actorId: input.profile.actorId,
    label: input.profile.label,
    role: input.profile.role,
    virtual: true,
  };
}

export function buildVirtualConversationRef(input: {
  providerId: string;
  profile: VirtualActorProfile;
  kind?: ConversationKind;
}): ConversationRef {
  const kind = input.kind ?? "direct";
  return {
    providerId: input.providerId,
    conversationId: `virtual:${input.profile.actorId}:${kind}`,
    actorId: input.profile.actorId,
    kind,
    native: false,
    sourceKey: input.profile.backingActorId,
  };
}

export function buildVirtualActorDispatchPrompt(input: {
  profile: VirtualActorProfile;
  message: string;
  targetActorIds?: string[];
}): string {
  const targetLine =
    input.targetActorIds && input.targetActorIds.length > 0
      ? `本轮需要重点协作的对象：${input.targetActorIds.join("、")}。`
      : "本轮没有额外指定的协作对象。";
  return `${input.profile.prompt}\n${targetLine}\n请只从该角色视角完成下面这条任务：\n${input.message}`;
}

export function providerNeedsVirtualActors(manifest: ProviderManifest): boolean {
  return manifest.actorStrategy === "virtual-actor" || manifest.actorStrategy === "single-executor";
}
