import { describe, expect, it } from "vitest";
import pluginEntry from "../index.js";
import setupEntry from "../setup-entry.js";
import { vkApprovalAuth } from "./approval-auth.js";
import { vkPlugin, vkSetupPlugin } from "./channel.js";

const DEFAULT_ACCOUNT_ID = "default";

describe("VK plugin entrypoints", () => {
  it("publishes the bundled VK channel plugin entry", () => {
    const loadedPlugin = pluginEntry.loadChannelPlugin();
    expect(pluginEntry.kind).toBe("bundled-channel-entry");
    expect(pluginEntry.id).toBe("vk");
    expect(pluginEntry.name).toBe("VK");
    expect(pluginEntry.description).toBe("VK channel plugin");
    expect(loadedPlugin.id).toBe(vkPlugin.id);
    expect(loadedPlugin.auth).toBeDefined();
    expect(loadedPlugin.auth?.authorizeActorAction).toBeTypeOf("function");
  });

  it("publishes the VK setup entry", () => {
    const loadedSetupPlugin = setupEntry.loadSetupPlugin();
    expect(setupEntry.kind).toBe("bundled-channel-setup-entry");
    expect(loadedSetupPlugin.id).toBe(vkSetupPlugin.id);
    expect(loadedSetupPlugin.setup?.resolveAccountId).toBeTypeOf("function");
    expect(vkSetupPlugin.id).toBe("vk");
  });

  it("wires same-chat approval auth through the live VK plugin", () => {
    expect(vkPlugin.auth).toBe(vkApprovalAuth);
  });

  it("advertises VK-specific message tool hints for explicit targets and local media", () => {
    const hints = vkPlugin.agentPrompt?.messageToolHints?.({ cfg: {} });
    expect(hints).toEqual(
      expect.arrayContaining([
        expect.stringContaining("vk:user:<user_id>"),
        expect.stringContaining("vk:chat:<peer_id>"),
        expect.stringContaining("absolute path"),
      ]),
    );
  });
});

describe("VK single-account setup/config contract", () => {
  it("always exposes only the default logical account id", () => {
    expect(vkPlugin.config.listAccountIds({})).toEqual([DEFAULT_ACCOUNT_ID]);
    expect(vkPlugin.config.listAccountIds({ channels: { vk: { communityId: "1" } } })).toEqual([
      DEFAULT_ACCOUNT_ID,
    ]);
    expect(
      vkPlugin.config.defaultAccountId?.({
        channels: { vk: { communityId: "1", enabled: false } },
      }),
    ).toBe(DEFAULT_ACCOUNT_ID);
  });

  it("normalizes omitted/empty/default account id to default", () => {
    const resolver = vkPlugin.setup?.resolveAccountId;
    if (!resolver) {
      throw new Error("VK setup resolver is missing");
    }
    expect(resolver({ cfg: {}, accountId: undefined, input: {} })).toBe(DEFAULT_ACCOUNT_ID);
    expect(resolver({ cfg: {}, accountId: "", input: {} })).toBe(DEFAULT_ACCOUNT_ID);
    expect(resolver({ cfg: {}, accountId: "default", input: {} })).toBe(DEFAULT_ACCOUNT_ID);
    expect(resolver({ cfg: {}, accountId: "DEFAULT", input: {} })).toBe(DEFAULT_ACCOUNT_ID);
  });

  it("rejects non-default account ids before config write", () => {
    const resolver = vkPlugin.setup?.resolveAccountId;
    if (!resolver) {
      throw new Error("VK setup resolver is missing");
    }
    expect(() => resolver({ cfg: {}, accountId: "ops", input: {} })).toThrowError(
      'VK supports only the "default" account id.',
    );
  });
});
