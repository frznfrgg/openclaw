import type { CommonChannelMessagingConfig } from "./types.channel-messaging-common.js";
import type { ChannelHealthMonitorConfig } from "./types.channels.js";
import type { SecretInput } from "./types.secrets.js";

export type VkGroupConfig = {
  enabled?: boolean;
};

export type VkConfig = CommonChannelMessagingConfig & {
  /** VK community id (positive numeric id, canonical decimal string). */
  communityId: string;
  /** VK community access token (plaintext or env SecretRef). */
  communityAccessToken?: SecretInput;
  /** Path to a file that contains the community access token. */
  tokenFile?: string;
  /** Default delivery target for outbound sends (vk:user:<id> or vk:chat:<peer_id>). */
  defaultTo?: string;
  /** Optional admitted VK group chats keyed by peer_id. */
  groups?: Record<string, VkGroupConfig>;
  healthMonitor?: ChannelHealthMonitorConfig;
};

declare module "./types.channels.js" {
  interface ChannelsConfig {
    vk?: VkConfig;
  }
}
