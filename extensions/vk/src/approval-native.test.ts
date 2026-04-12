import { beforeEach, describe, expect, it } from "vitest";
import {
  buildVkApprovalPendingText,
  forgetVkPendingApproval,
  rememberVkPendingApproval,
  resetVkApprovalStateForTests,
  resolveVkApprovalProxyReply,
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

  it("requires approval codes when multiple pending approvals share the same approver DM", () => {
    rememberVkPendingApproval({
      accountId: "default",
      senderId: "42",
      approvalId: "3c274b25-d99d-46fb-9c72-6d2d3124ca33",
    });
    rememberVkPendingApproval({
      accountId: "default",
      senderId: "42",
      approvalId: "9f1f524f-1234-4e72-aaaa-bbbbbbbbbbbb",
    });

    const ambiguous = resolveVkApprovalProxyReply({
      accountId: "default",
      senderId: "42",
      rawBody: "approve once",
    });
    expect(ambiguous).toMatchObject({
      kind: "error",
    });
    if (ambiguous.kind !== "error") {
      throw new Error("expected ambiguous approval reply to require a code");
    }
    expect(ambiguous.message).toContain("approve once 3c274b25d99d");
    expect(ambiguous.message).toContain("Pending codes: 3c274b25d99d, 9f1f524f1234.");

    expect(
      resolveVkApprovalProxyCommand({
        accountId: "default",
        senderId: "42",
        rawBody: "approve once 3c274b25d99d",
      }),
    ).toBe("/approve 3c274b25-d99d-46fb-9c72-6d2d3124ca33 allow-once");
    expect(
      resolveVkApprovalProxyCommand({
        accountId: "default",
        senderId: "42",
        rawBody: "deny 9f1f524f1234",
      }),
    ).toBe("/approve 9f1f524f-1234-4e72-aaaa-bbbbbbbbbbbb deny");
  });

  it("evicts expired approvals and forgets resolved approvals", () => {
    rememberVkPendingApproval({
      accountId: "default",
      senderId: "42",
      approvalId: "3c274b25-d99d-46fb-9c72-6d2d3124ca33",
      expiresAtMs: 10,
    });

    expect(
      resolveVkApprovalProxyReply({
        accountId: "default",
        senderId: "42",
        rawBody: "approve once 3c274b25d99d",
        nowMs: 11,
      }),
    ).toEqual({
      kind: "error",
      message: "There are no pending approvals in this DM.",
    });

    rememberVkPendingApproval({
      accountId: "default",
      senderId: "42",
      approvalId: "9f1f524f-1234-4e72-aaaa-bbbbbbbbbbbb",
    });
    expect(
      resolveVkApprovalProxyCommand({
        accountId: "default",
        senderId: "42",
        rawBody: "approve once 9f1f524f1234",
      }),
    ).toBe("/approve 9f1f524f-1234-4e72-aaaa-bbbbbbbbbbbb allow-once");

    forgetVkPendingApproval({
      accountId: "default",
      senderId: "42",
      approvalId: "9f1f524f-1234-4e72-aaaa-bbbbbbbbbbbb",
    });

    expect(
      resolveVkApprovalProxyReply({
        accountId: "default",
        senderId: "42",
        rawBody: "approve once 9f1f524f1234",
      }),
    ).toEqual({
      kind: "error",
      message: "There are no pending approvals in this DM.",
    });
  });

  it("formats human-readable VK approval requests without raw /approve instructions", () => {
    const text = buildVkApprovalPendingText({
      approvalId: "3c274b25-d99d-46fb-9c72-6d2d3124ca33",
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
    expect(text).toContain("Approval code: 3c274b25d99d");
    expect(text).toContain("Reply in this DM with one of:");
    expect(text).toContain("approve once 3c274b25d99d");
    expect(text).toContain("deny 3c274b25d99d");
    expect(text).not.toContain("/approve");
    expect(text).not.toContain("Full id:");
  });
});
