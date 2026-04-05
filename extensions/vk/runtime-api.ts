// Private runtime barrel for the bundled VK extension.
// Keep this barrel thin and generic-only.

export type { BaseProbeResult } from "openclaw/plugin-sdk/channel-contract";
export type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
export type { PluginRuntime } from "openclaw/plugin-sdk/runtime-store";
export {
  DEFAULT_ACCOUNT_ID,
  buildChannelConfigSchema,
  createChannelPluginBase,
  getChatChannelMeta,
  tryReadSecretFileSync,
} from "openclaw/plugin-sdk/core";
export {
  PAIRING_APPROVED_MESSAGE,
  collectStatusIssuesFromLastError,
  createDefaultChannelRuntimeState,
} from "openclaw/plugin-sdk/channel-status";
export { setVkRuntime } from "./src/runtime.js";
