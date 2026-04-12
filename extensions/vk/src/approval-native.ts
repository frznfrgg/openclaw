import { createLazyChannelApprovalNativeRuntimeAdapter } from "openclaw/plugin-sdk/approval-handler-adapter-runtime";
import type { ChannelApprovalNativeRuntimeAdapter } from "openclaw/plugin-sdk/approval-handler-runtime";
import { createApproverRestrictedNativeApprovalCapability } from "openclaw/plugin-sdk/approval-runtime";
import type { ChannelApprovalCapability } from "openclaw/plugin-sdk/channel-contract";
import { normalizeOptionalString } from "openclaw/plugin-sdk/text-runtime";
import {
  getVkApprovalApprovers,
  isVkApprovalApprover,
  isVkApprovalDeliveryEnabled,
} from "./approval-auth.js";
import { VK_DEFAULT_ACCOUNT_ID } from "./shared.js";
import { normalizeVkUserId } from "./targets.js";

type VkApprovalDecision = "allow-once" | "allow-always" | "deny";

type PendingVkApprovalRoute = {
  approvalId: string;
  accountId: string;
  senderId: string;
};

const pendingVkApprovalsBySender = new Map<string, PendingVkApprovalRoute>();

function buildPendingVkApprovalKey(params: { accountId?: string | null; senderId: string }): string {
  return `${params.accountId?.trim() || VK_DEFAULT_ACCOUNT_ID}:${params.senderId}`;
}

function parseVkApprovalDecision(text: string): VkApprovalDecision | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (/^(approve|allow)(?:\s+(once|one|this))?$/.test(normalized)) {
    return "allow-once";
  }
  if (/^(approve|allow)\s+(always|forever)$/.test(normalized)) {
    return "allow-always";
  }
  if (/^(deny|reject|block|cancel|no)$/.test(normalized)) {
    return "deny";
  }
  return null;
}

export function rememberVkPendingApproval(params: {
  accountId?: string | null;
  senderId: string;
  approvalId: string;
}): void {
  pendingVkApprovalsBySender.set(buildPendingVkApprovalKey(params), {
    approvalId: params.approvalId,
    accountId: params.accountId?.trim() || VK_DEFAULT_ACCOUNT_ID,
    senderId: params.senderId,
  });
}

export function forgetVkPendingApproval(params: {
  accountId?: string | null;
  senderId: string;
  approvalId?: string;
}): void {
  const key = buildPendingVkApprovalKey(params);
  const current = pendingVkApprovalsBySender.get(key);
  if (!current) {
    return;
  }
  if (params.approvalId && current.approvalId !== params.approvalId) {
    return;
  }
  pendingVkApprovalsBySender.delete(key);
}

export function resolveVkApprovalProxyCommand(params: {
  accountId?: string | null;
  senderId?: string | null;
  rawBody: string;
}): string | null {
  const senderId = params.senderId ? normalizeVkUserId(params.senderId) : undefined;
  if (!senderId) {
    return null;
  }
  const decision = parseVkApprovalDecision(params.rawBody);
  if (!decision) {
    return null;
  }
  const entry = pendingVkApprovalsBySender.get(
    buildPendingVkApprovalKey({
      accountId: params.accountId,
      senderId,
    }),
  );
  if (!entry) {
    return null;
  }
  return `/approve ${entry.approvalId} ${decision}`;
}

export function buildVkApprovalPendingText(params: {
  view: {
    approvalKind: "exec" | "plugin";
    title: string;
    description?: string | null;
    metadata?: Array<{ label: string; value: string }>;
    ask?: string | null;
    commandText?: string | null;
    actions: Array<{ decision: string }>;
    expiresAtMs: number;
  };
  nowMs: number;
}): string {
  const lines: string[] = [];
  lines.push(params.view.title);
  if (params.view.description?.trim()) {
    lines.push(params.view.description.trim());
  } else if (params.view.approvalKind === "exec") {
    lines.push("OpenClaw needs your approval to run a command.");
  }
  if (params.view.ask?.trim()) {
    lines.push(params.view.ask.trim());
  }
  for (const metadata of params.view.metadata ?? []) {
    const value = normalizeOptionalString(metadata.value);
    if (value) {
      lines.push(`${metadata.label}: ${value}`);
    }
  }
  const commandText = normalizeOptionalString(params.view.commandText ?? undefined);
  if (commandText) {
    lines.push("");
    lines.push("Command:");
    lines.push("```sh");
    lines.push(commandText);
    lines.push("```");
  }
  const actions = params.view.actions
    .map((action) => action.decision)
    .filter((decision): decision is VkApprovalDecision => {
      return decision === "allow-once" || decision === "allow-always" || decision === "deny";
    });
  lines.push("");
  lines.push("Reply in this DM with one of:");
  if (actions.includes("allow-once")) {
    lines.push("approve once");
  }
  if (actions.includes("allow-always")) {
    lines.push("approve always");
  }
  if (actions.includes("deny")) {
    lines.push("deny");
  }
  const expiresInMs = Math.max(0, params.view.expiresAtMs - params.nowMs);
  const expiresInMin = Math.ceil(expiresInMs / 60_000);
  if (expiresInMin > 0) {
    lines.push("");
    lines.push(`Expires in about ${expiresInMin} minute${expiresInMin === 1 ? "" : "s"}.`);
  }
  return lines.join("\n");
}

export const vkApprovalCapability: ChannelApprovalCapability =
  createApproverRestrictedNativeApprovalCapability({
    channel: "vk",
    channelLabel: "VK",
    describeExecApprovalSetup: () =>
      "Configure VK approvers with `channels.vk.allowFrom`, pairing-approved DMs, or a direct `channels.vk.defaultTo` target. When VK approvers are available, approval requests are delivered as native VK DMs.",
    listAccountIds: () => [VK_DEFAULT_ACCOUNT_ID],
    hasApprovers: ({ cfg, accountId }) => getVkApprovalApprovers({ cfg, accountId }).length > 0,
    isExecAuthorizedSender: ({ cfg, accountId, senderId }) =>
      isVkApprovalApprover({ cfg, accountId, senderId }),
    isNativeDeliveryEnabled: ({ cfg, accountId }) =>
      isVkApprovalDeliveryEnabled({ cfg, accountId }),
    resolveNativeDeliveryMode: () => "dm",
    resolveApproverDmTargets: ({ cfg, accountId }) =>
      getVkApprovalApprovers({ cfg, accountId }).map((approver) => ({
        to: `vk:user:${approver}`,
      })),
    notifyOriginWhenDmOnly: true,
    nativeRuntime: createLazyChannelApprovalNativeRuntimeAdapter({
      eventKinds: ["exec", "plugin"],
      isConfigured: ({ cfg, accountId }) => isVkApprovalDeliveryEnabled({ cfg, accountId }),
      shouldHandle: ({ cfg, accountId }) => isVkApprovalDeliveryEnabled({ cfg, accountId }),
      load: async () =>
        (await import("./approval-handler.runtime.js"))
          .vkApprovalNativeRuntime as unknown as ChannelApprovalNativeRuntimeAdapter,
    }),
  });

export function resetVkApprovalStateForTests(): void {
  pendingVkApprovalsBySender.clear();
}
