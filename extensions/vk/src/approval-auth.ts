import { mergeDmAllowFromSources } from "openclaw/plugin-sdk/allow-from";
import {
  createResolvedApproverActionAuthAdapter,
  resolveApprovalApprovers,
} from "openclaw/plugin-sdk/approval-runtime";
import { readChannelAllowFromStoreSync } from "openclaw/plugin-sdk/channel-pairing";
import { inspectVkAccount } from "./account-inspect.js";
import { VK_CHANNEL } from "./shared.js";
import { normalizeVkUserId, parseVkExplicitTarget } from "./targets.js";

function normalizeVkApproverId(value: string | number): string | undefined {
  const normalized = normalizeVkUserId(String(value));
  return normalized || undefined;
}

function normalizeVkDefaultTargetToApprover(value: string): string | undefined {
  const parsed = parseVkExplicitTarget(value);
  return parsed?.kind === "user" ? parsed.userId : undefined;
}

export const vkApprovalAuth = createResolvedApproverActionAuthAdapter({
  channelLabel: "VK",
  resolveApprovers: ({ cfg, accountId }) => {
    const account = inspectVkAccount({ cfg, accountId });
    const storeAllowFrom = readChannelAllowFromStoreSync(
      VK_CHANNEL,
      process.env,
      account.accountId,
    ).map(String);
    const mergedAllowFrom = mergeDmAllowFromSources({
      allowFrom: account.config.allowFrom,
      storeAllowFrom,
      dmPolicy: account.config.dmPolicy,
    });
    return resolveApprovalApprovers({
      allowFrom: mergedAllowFrom,
      defaultTo: account.config.defaultTo,
      normalizeApprover: normalizeVkApproverId,
      normalizeDefaultTo: normalizeVkDefaultTargetToApprover,
    });
  },
  normalizeSenderId: (value) => normalizeVkApproverId(value),
});
