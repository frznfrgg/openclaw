import type { PendingApprovalView } from "openclaw/plugin-sdk/approval-handler-runtime";
import { createChannelApprovalNativeRuntimeAdapter } from "openclaw/plugin-sdk/approval-handler-runtime";
import { createSubsystemLogger } from "openclaw/plugin-sdk/runtime-env";
import {
  buildVkApprovalPendingText,
  forgetVkPendingApproval,
  rememberVkPendingApproval,
} from "./approval-native.js";
import { sendVkText } from "./send.js";
import { VK_DEFAULT_ACCOUNT_ID } from "./shared.js";
import { parseVkExplicitTarget } from "./targets.js";

const log = createSubsystemLogger("vk/approvals");

type VkPendingApprovalEntry = {
  messageId: string;
  accountId: string;
  senderId: string;
  approvalId: string;
};

function resolveVkApprovalRecipient(target: string): string | null {
  const parsed = parseVkExplicitTarget(target);
  return parsed?.kind === "user" ? parsed.userId ?? null : null;
}

export const vkApprovalNativeRuntime = createChannelApprovalNativeRuntimeAdapter<
  string,
  string,
  VkPendingApprovalEntry,
  VkPendingApprovalEntry
>({
  eventKinds: ["exec", "plugin"],
  availability: {
    isConfigured: () => true,
    shouldHandle: () => true,
  },
  presentation: {
    buildPendingPayload: ({ request, view, nowMs }) =>
      buildVkApprovalPendingText({
        approvalId: request.id,
        view: view,
        nowMs,
      }),
    buildResolvedResult: () => ({ kind: "leave" }),
    buildExpiredResult: () => ({ kind: "leave" }),
  },
  transport: {
    prepareTarget: ({ plannedTarget }) => ({
      dedupeKey: plannedTarget.target.to,
      target: plannedTarget.target.to,
    }),
    deliverPending: async ({ cfg, accountId, preparedTarget, request, pendingPayload, view }) => {
      const result = await sendVkText({
        cfg,
        accountId: accountId ?? VK_DEFAULT_ACCOUNT_ID,
        to: preparedTarget,
        text: pendingPayload,
      });
      const recipient = resolveVkApprovalRecipient(preparedTarget);
      if (!recipient) {
        return null;
      }
      const entry: VkPendingApprovalEntry = {
        messageId: result.messageId,
        accountId: accountId ?? VK_DEFAULT_ACCOUNT_ID,
        senderId: recipient,
        approvalId: request.id,
      };
      rememberVkPendingApproval({
        accountId: entry.accountId,
        senderId: entry.senderId,
        approvalId: entry.approvalId,
        expiresAtMs: view.expiresAtMs,
      });
      return entry;
    },
  },
  interactions: {
    bindPending: ({ entry }) => entry,
    unbindPending: ({ binding }) => {
      if (!binding) {
        return;
      }
      forgetVkPendingApproval({
        accountId: binding.accountId,
        senderId: binding.senderId,
        approvalId: binding.approvalId,
      });
    },
  },
  observe: {
    onDeliveryError: ({ error, request }) => {
      log.error(`vk approvals: failed to send request ${request.id}: ${String(error)}`);
    },
  },
});
