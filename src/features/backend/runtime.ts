import type { Company, EmployeeRef, ProviderConversationRef } from "../company/types";
import type {
  ActorRef,
  BackendCore,
  ConversationKind,
  ConversationRef,
  ProviderManifest,
} from "./types";
import {
  buildVirtualActorDispatchPrompt,
  buildVirtualActorProfiles,
  buildVirtualConversationRef,
  providerNeedsVirtualActors,
  toVirtualActorRef,
  type VirtualActorProfile,
} from "./virtual-actor";

type RuntimeActorResolution = {
  actorRef: ActorRef;
  conversationRef: ConversationRef;
  profile?: VirtualActorProfile | null;
  backingActorRef?: ActorRef | null;
  backingConversationRef?: ConversationRef | null;
};

function findEmployee(company: Company | null | undefined, actorId: string): EmployeeRef | null {
  return company?.employees.find((employee) => employee.agentId === actorId) ?? null;
}

function buildNativeActorRef(input: {
  providerId: string;
  company: Company | null | undefined;
  actorId: string;
}): ActorRef {
  const employee = findEmployee(input.company, input.actorId);
  return {
    providerId: input.providerId,
    actorId: input.actorId,
    label: employee?.nickname ?? input.actorId,
    role: employee?.role,
  };
}

async function resolveVirtualActorRuntime(input: {
  backend: BackendCore;
  manifest: ProviderManifest;
  company: Company | null | undefined;
  actorId: string;
  kind?: ConversationKind;
}): Promise<RuntimeActorResolution | null> {
  if (!providerNeedsVirtualActors(input.manifest) || !input.company) {
    return null;
  }

  const availableActors = await input.backend.listActors();
  const executorActor = availableActors[0];
  if (!executorActor) {
    return null;
  }

  const profiles = buildVirtualActorProfiles({
    providerId: input.backend.providerId,
    executorActorId: executorActor.actorId,
    employees: input.company.employees,
  });
  const profile = profiles.find((candidate) => candidate.actorId === input.actorId);
  if (!profile) {
    return null;
  }

  const actorRef = toVirtualActorRef({
    providerId: input.backend.providerId,
    profile,
  });
  const backingActorRef: ActorRef = {
    providerId: input.backend.providerId,
    actorId: executorActor.actorId,
    label: executorActor.label ?? executorActor.actorId,
    role: executorActor.role,
  };

  return {
    actorRef,
    conversationRef: buildVirtualConversationRef({
      providerId: input.backend.providerId,
      profile,
      kind: input.kind,
    }),
    profile,
    backingActorRef,
    backingConversationRef: await input.backend.ensureConversation(backingActorRef, "direct"),
  };
}

export async function resolveCompanyActorConversation(input: {
  backend: BackendCore;
  manifest: ProviderManifest;
  company: Company | null | undefined;
  actorId: string;
  kind?: ConversationKind;
}): Promise<RuntimeActorResolution> {
  const virtualResolution = await resolveVirtualActorRuntime(input);
  if (virtualResolution) {
    return virtualResolution;
  }

  const actorRef = buildNativeActorRef({
    providerId: input.backend.providerId,
    company: input.company,
    actorId: input.actorId,
  });
  return {
    actorRef,
    conversationRef: await input.backend.ensureConversation(actorRef, input.kind ?? "direct"),
  };
}

export async function sendTurnToCompanyActor(input: {
  backend: BackendCore;
  manifest: ProviderManifest;
  company: Company | null | undefined;
  actorId: string;
  message: string;
  kind?: ConversationKind;
  timeoutMs?: number;
  attachments?: Array<{ type: string; mimeType: string; content: string }>;
  targetActorIds?: string[];
}): Promise<{
  actorRef: ActorRef;
  conversationRef: ConversationRef;
  providerConversationRef: ProviderConversationRef;
  runId: string;
  status: "started" | "in_flight";
}> {
  const resolved = await resolveCompanyActorConversation(input);
  const sendConversation = resolved.backingConversationRef ?? resolved.conversationRef;
  const message = resolved.profile
    ? buildVirtualActorDispatchPrompt({
        profile: resolved.profile,
        message: input.message,
        targetActorIds: input.targetActorIds,
      })
    : input.message;

  const result = await input.backend.sendTurn(sendConversation, message, {
    timeoutMs: input.timeoutMs,
    attachments: input.attachments,
    targetActorIds: input.targetActorIds,
  });

  return {
    actorRef: resolved.actorRef,
    conversationRef: resolved.conversationRef,
    providerConversationRef: {
      providerId: input.backend.providerId,
      conversationId: sendConversation.conversationId,
      actorId: input.actorId,
      nativeRoom: sendConversation.kind === "room",
    },
    runId: result.run.runId,
    status: result.status,
  };
}

