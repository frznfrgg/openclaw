import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getVkApprovalApprovers,
  isVkApprovalApprover,
  isVkApprovalDeliveryEnabled,
} from "./approval-auth.js";

const { readChannelAllowFromStoreSyncMock } = vi.hoisted(() => ({
  readChannelAllowFromStoreSyncMock: vi.fn(() => [] as string[]),
}));

vi.mock("openclaw/plugin-sdk/channel-pairing", () => ({
  readChannelAllowFromStoreSync: readChannelAllowFromStoreSyncMock,
}));

describe("VK approval approvers", () => {
  beforeEach(() => {
    readChannelAllowFromStoreSyncMock.mockReset();
    readChannelAllowFromStoreSyncMock.mockReturnValue([]);
  });

  it("includes paired VK users from the pairing allow-from store", () => {
    readChannelAllowFromStoreSyncMock.mockReturnValue(["42"]);

    expect(
      getVkApprovalApprovers({
        cfg: {
          channels: {
            vk: {
              communityId: "1",
              dmPolicy: "pairing",
            },
          },
        },
        accountId: "default",
      }),
    ).toEqual(["42"]);
    expect(
      isVkApprovalApprover({
        cfg: {
          channels: {
            vk: {
              communityId: "1",
              dmPolicy: "pairing",
            },
          },
        },
        accountId: "default",
        senderId: "42",
      }),
    ).toBe(true);
  });

  it("includes configured direct default targets and ignores group targets", () => {
    expect(
      getVkApprovalApprovers({
        cfg: {
          channels: {
            vk: {
              communityId: "1",
              defaultTo: "vk:user:77",
            },
          },
        },
      }),
    ).toEqual(["77"]);

    expect(
      getVkApprovalApprovers({
        cfg: {
          channels: {
            vk: {
              communityId: "1",
              defaultTo: "vk:chat:2000000001",
            },
          },
        },
      }),
    ).toEqual([]);
  });

  it("disables native delivery when no approvers are configured", () => {
    expect(
      isVkApprovalDeliveryEnabled({
        cfg: {
          channels: {
            vk: {
              communityId: "1",
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("rejects non-approvers when config or store resolves an explicit VK approver list", () => {
    readChannelAllowFromStoreSyncMock.mockReturnValue(["42"]);

    expect(
      isVkApprovalApprover({
        cfg: {
          channels: {
            vk: {
              communityId: "1",
              allowFrom: ["42"],
              dmPolicy: "pairing",
            },
          },
        },
        senderId: "99",
      }),
    ).toBe(false);
  });
});
