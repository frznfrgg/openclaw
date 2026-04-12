import { mergeDmAllowFromSources } from "openclaw/plugin-sdk/allow-from";
import { resolveApprovalApprovers } from "openclaw/plugin-sdk/approval-auth-runtime";
import { readChannelAllowFromStoreSync } from "openclaw/plugin-sdk/channel-pairing";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { inspectVkAccount } from "./account-inspect.js";
import { VK_CHANNEL, VK_DEFAULT_ACCOUNT_ID } from "./shared.js";
import { normalizeVkUserId, parseVkExplicitTarget } from "./targets.js";

function normalizeVkApproverId(value: string | number): string | undefined {
  const normalized = normalizeVkUserId(String(value));
  return normalized || undefined;
}

function normalizeVkDefaultTargetToApprover(value: string): string | undefined {
  const parsed = parseVkExplicitTarget(value);
  return parsed?.kind === "user" ? parsed.userId : undefined;
}

export function getVkApprovalApprovers(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): string[] {
  const account = inspectVkAccount({
    cfg: params.cfg,
    accountId: params.accountId ?? VK_DEFAULT_ACCOUNT_ID,
  });
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
}

export function isVkApprovalApprover(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
  senderId?: string | null;
}): boolean {
  const senderId = params.senderId ? normalizeVkApproverId(params.senderId) : undefined;
  return !!senderId && getVkApprovalApprovers(params).includes(senderId);
}

export function isVkApprovalDeliveryEnabled(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): boolean {
  return getVkApprovalApprovers(params).length > 0;
}
