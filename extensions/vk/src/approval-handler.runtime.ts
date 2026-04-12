import type { PendingApprovalView } from "openclaw/plugin-sdk/approval-handler-runtime";
import { createChannelApprovalNativeRuntimeAdapter } from "openclaw/plugin-sdk/approval-handler-runtime";
import { createSubsystemLogger } from "openclaw/plugin-sdk/runtime-env";
import { rememberVkPendingApproval, buildVkApprovalPendingText } from "./approval-native.js";
import { sendVkText } from "./send.js";
import { VK_DEFAULT_ACCOUNT_ID } from "./shared.js";
import { parseVkExplicitTarget } from "./targets.js";

const log = createSubsystemLogger("vk/approvals");

function resolveVkApprovalRecipient(target: string): string | null {
  const parsed = parseVkExplicitTarget(target);
  return parsed?.kind === "user" ? parsed.userId : null;
}

export const vkApprovalNativeRuntime = createChannelApprovalNativeRuntimeAdapter<string, string, string>({
  eventKinds: ["exec", "plugin"],
  availability: {
    isConfigured: () => true,
    shouldHandle: () => true,
  },
  presentation: {
    buildPendingPayload: ({ view, nowMs }) =>
      buildVkApprovalPendingText({
        view: view as PendingApprovalView,
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
    deliverPending: async ({ cfg, accountId, preparedTarget, request, pendingPayload }) => {
      const result = await sendVkText({
        cfg,
        accountId: accountId ?? VK_DEFAULT_ACCOUNT_ID,
        to: preparedTarget,
        text: pendingPayload,
      });
      const recipient = resolveVkApprovalRecipient(preparedTarget);
      if (recipient) {
        rememberVkPendingApproval({
          accountId: accountId ?? VK_DEFAULT_ACCOUNT_ID,
          senderId: recipient,
          approvalId: request.id,
        });
      }
      return result.messageId;
    },
  },
  observe: {
    onDeliveryError: ({ error, request }) => {
      log.error(`vk approvals: failed to send request ${request.id}: ${String(error)}`);
    },
  },
});
