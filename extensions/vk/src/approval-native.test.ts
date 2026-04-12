import { beforeEach, describe, expect, it } from "vitest";
import {
  buildVkApprovalPendingText,
  rememberVkPendingApproval,
  resetVkApprovalStateForTests,
  resolveVkApprovalProxyCommand,
} from "./approval-native.js";

describe("VK native approvals", () => {
  beforeEach(() => {
    resetVkApprovalStateForTests();
  });

  it("rewrites plain DM approval replies into /approve commands", () => {
    rememberVkPendingApproval({
      accountId: "default",
      senderId: "42",
      approvalId: "3c274b25-d99d-46fb-9c72-6d2d3124ca33",
    });

    expect(
      resolveVkApprovalProxyCommand({
        accountId: "default",
        senderId: "42",
        rawBody: "approve once",
      }),
    ).toBe("/approve 3c274b25-d99d-46fb-9c72-6d2d3124ca33 allow-once");
    expect(
      resolveVkApprovalProxyCommand({
        accountId: "default",
        senderId: "42",
        rawBody: "approve always",
      }),
    ).toBe("/approve 3c274b25-d99d-46fb-9c72-6d2d3124ca33 allow-always");
    expect(
      resolveVkApprovalProxyCommand({
        accountId: "default",
        senderId: "42",
        rawBody: "deny",
      }),
    ).toBe("/approve 3c274b25-d99d-46fb-9c72-6d2d3124ca33 deny");
  });

  it("formats human-readable VK approval requests without raw /approve instructions", () => {
    const text = buildVkApprovalPendingText({
      view: {
        approvalKind: "exec",
        title: "Exec Approval Required",
        description: "A command needs your approval.",
        metadata: [
          { label: "Agent", value: "default" },
          { label: "CWD", value: "/root/.openclaw/workspace" },
        ],
        commandText: "git status",
        actions: [{ decision: "allow-once" }, { decision: "deny" }],
        expiresAtMs: 120_000,
      },
      nowMs: 0,
    });

    expect(text).toContain("Exec Approval Required");
    expect(text).toContain("Reply in this DM with one of:");
    expect(text).toContain("approve once");
    expect(text).toContain("deny");
    expect(text).not.toContain("/approve");
    expect(text).not.toContain("Full id:");
  });
});
