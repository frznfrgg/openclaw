import { defineSetupPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { vkSetupPlugin } from "./src/channel.js";

export { vkSetupPlugin } from "./src/channel.js";

export default defineSetupPluginEntry(vkSetupPlugin);
