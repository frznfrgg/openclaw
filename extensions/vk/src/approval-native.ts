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
  replyToken: string;
  expiresAtMs: number;
};

type VkApprovalProxyReply =
  | { kind: "miss" }
  | { kind: "command"; command: string }
  | { kind: "error"; message: string };

type ParsedVkApprovalDecision = {
  decision: VkApprovalDecision;
  replyToken?: string;
};

const VK_APPROVAL_REPLY_TOKEN_LENGTH = 12;
const pendingVkApprovalsBySender = new Map<string, PendingVkApprovalRoute[]>();

function buildPendingVkApprovalKey(params: {
  accountId?: string | null;
  senderId: string;
}): string {
  return `${params.accountId?.trim() || VK_DEFAULT_ACCOUNT_ID}:${params.senderId}`;
}

function normalizeVkApprovalReplyToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildVkApprovalReplyToken(approvalId: string): string {
  const normalized = normalizeVkApprovalReplyToken(approvalId);
  if (!normalized) {
    return "approval";
  }
  return normalized.slice(0, VK_APPROVAL_REPLY_TOKEN_LENGTH);
}

function pruneExpiredPendingVkApprovals(key: string, nowMs: number): PendingVkApprovalRoute[] {
  const entries = pendingVkApprovalsBySender.get(key) ?? [];
  const activeEntries = entries.filter((entry) => entry.expiresAtMs > nowMs);
  if (activeEntries.length === 0) {
    pendingVkApprovalsBySender.delete(key);
    return [];
  }
  if (activeEntries.length !== entries.length) {
    pendingVkApprovalsBySender.set(key, activeEntries);
  }
  return activeEntries;
}

function parseVkApprovalDecision(text: string): ParsedVkApprovalDecision | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const allowAlwaysMatch = normalized.match(
    /^(approve|allow)\s+(always|forever)(?:\s+([a-z0-9-]+))?$/,
  );
  if (allowAlwaysMatch) {
    return {
      decision: "allow-always",
      ...(allowAlwaysMatch[3]
        ? { replyToken: normalizeVkApprovalReplyToken(allowAlwaysMatch[3]) }
        : {}),
    };
  }
  const allowOnceMatch = normalized.match(
    /^(approve|allow)(?:\s+(once|one|this))?(?:\s+([a-z0-9-]+))?$/,
  );
  if (allowOnceMatch) {
    return {
      decision: "allow-once",
      ...(allowOnceMatch[3]
        ? { replyToken: normalizeVkApprovalReplyToken(allowOnceMatch[3]) }
        : {}),
    };
  }
  const denyMatch = normalized.match(/^(deny|reject|block|cancel|no)(?:\s+([a-z0-9-]+))?$/);
  if (denyMatch) {
    return {
      decision: "deny",
      ...(denyMatch[2] ? { replyToken: normalizeVkApprovalReplyToken(denyMatch[2]) } : {}),
    };
  }
  return null;
}

export function rememberVkPendingApproval(params: {
  accountId?: string | null;
  senderId: string;
  approvalId: string;
  expiresAtMs?: number;
}): void {
  const key = buildPendingVkApprovalKey(params);
  const nextEntry: PendingVkApprovalRoute = {
    approvalId: params.approvalId,
    accountId: params.accountId?.trim() || VK_DEFAULT_ACCOUNT_ID,
    senderId: params.senderId,
    replyToken: buildVkApprovalReplyToken(params.approvalId),
    expiresAtMs: params.expiresAtMs ?? Number.POSITIVE_INFINITY,
  };
  const remaining = pruneExpiredPendingVkApprovals(key, Date.now()).filter(
    (entry) => entry.approvalId !== params.approvalId,
  );
  remaining.push(nextEntry);
  pendingVkApprovalsBySender.set(key, remaining);
}

export function forgetVkPendingApproval(params: {
  accountId?: string | null;
  senderId: string;
  approvalId?: string;
}): void {
  const key = buildPendingVkApprovalKey(params);
  const current = pendingVkApprovalsBySender.get(key) ?? [];
  if (current.length === 0) {
    return;
  }
  if (!params.approvalId) {
    pendingVkApprovalsBySender.delete(key);
    return;
  }
  const remaining = current.filter((entry) => entry.approvalId !== params.approvalId);
  if (remaining.length === 0) {
    pendingVkApprovalsBySender.delete(key);
    return;
  }
  pendingVkApprovalsBySender.set(key, remaining);
}

export function resolveVkApprovalProxyReply(params: {
  accountId?: string | null;
  senderId?: string | null;
  rawBody: string;
  nowMs?: number;
}): VkApprovalProxyReply {
  const senderId = params.senderId ? normalizeVkUserId(params.senderId) : undefined;
  if (!senderId) {
    return { kind: "miss" };
  }
  const parsedDecision = parseVkApprovalDecision(params.rawBody);
  if (!parsedDecision) {
    return { kind: "miss" };
  }
  const key = buildPendingVkApprovalKey({
    accountId: params.accountId,
    senderId,
  });
  const entries = pruneExpiredPendingVkApprovals(key, params.nowMs ?? Date.now());
  if (entries.length === 0) {
    return {
      kind: "error",
      message: "There are no pending approvals in this DM.",
    };
  }
  if (parsedDecision.replyToken) {
    const matchedEntry = entries.find((entry) => {
      return (
        entry.replyToken === parsedDecision.replyToken ||
        normalizeVkApprovalReplyToken(entry.approvalId) === parsedDecision.replyToken
      );
    });
    if (!matchedEntry) {
      return {
        kind: "error",
        message:
          `No pending approval matches code ${parsedDecision.replyToken}. ` +
          "Reply with one of the approval codes shown in the pending request message.",
      };
    }
    return {
      kind: "command",
      command: `/approve ${matchedEntry.approvalId} ${parsedDecision.decision}`,
    };
  }
  if (entries.length === 1) {
    return {
      kind: "command",
      command: `/approve ${entries[0].approvalId} ${parsedDecision.decision}`,
    };
  }
  return {
    kind: "error",
    message:
      "You have multiple pending approvals in this DM. " +
      `Reply with the approval code shown in the request, for example: approve once ${entries[0].replyToken}. ` +
      `Pending codes: ${entries.map((entry) => entry.replyToken).join(", ")}.`,
  };
}

export function resolveVkApprovalProxyCommand(params: {
  accountId?: string | null;
  senderId?: string | null;
  rawBody: string;
}): string | null {
  const resolved = resolveVkApprovalProxyReply(params);
  return resolved.kind === "command" ? resolved.command : null;
}

export function buildVkApprovalPendingText(params: {
  approvalId: string;
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
  const replyToken = buildVkApprovalReplyToken(params.approvalId);
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
  lines.push("");
  lines.push(`Approval code: ${replyToken}`);
  const actions = new Set(
    params.view.actions
      .map((action) => action.decision)
      .filter((decision): decision is VkApprovalDecision => {
        return decision === "allow-once" || decision === "allow-always" || decision === "deny";
      }),
  );
  lines.push("");
  lines.push("Reply in this DM with one of:");
  if (actions.has("allow-once")) {
    lines.push(`approve once ${replyToken}`);
  }
  if (actions.has("allow-always")) {
    lines.push(`approve always ${replyToken}`);
  }
  if (actions.has("deny")) {
    lines.push(`deny ${replyToken}`);
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
