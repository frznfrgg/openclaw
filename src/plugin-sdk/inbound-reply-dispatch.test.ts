import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createChannelReplyPipeline: vi.fn(() => ({
    onModelSelected: vi.fn(),
  })),
  createNormalizedOutboundDeliverer: vi.fn((deliver) => deliver),
}));

vi.mock("./channel-reply-pipeline.js", () => ({
  createChannelReplyPipeline: mocks.createChannelReplyPipeline,
}));

vi.mock("./reply-payload.js", () => ({
  createNormalizedOutboundDeliverer: mocks.createNormalizedOutboundDeliverer,
}));

import { dispatchInboundReplyWithBase } from "./inbound-reply-dispatch.js";

describe("dispatchInboundReplyWithBase", () => {
  beforeEach(() => {
    mocks.createChannelReplyPipeline.mockClear();
    mocks.createNormalizedOutboundDeliverer.mockClear();
  });

  it("forwards typing params into the reply pipeline", async () => {
    const recordInboundSession = vi.fn(async () => {});
    const dispatchReplyWithBufferedBlockDispatcher = vi.fn(async () => ({
      queuedFinal: false,
      counts: {
        tool: 0,
        block: 0,
        final: 0,
      },
    }));
    const deliver = vi.fn(async () => {});
    const typing = {
      onStart: vi.fn(async () => {}),
      onStop: vi.fn(async () => {}),
    };

    await dispatchInboundReplyWithBase({
      cfg: {},
      channel: "vk",
      route: {
        agentId: "main",
        sessionKey: "agent:main:vk:dm:42",
      },
      storePath: "/tmp/session-store.json",
      ctxPayload: {
        SessionKey: "agent:main:vk:dm:42",
      } as never,
      core: {
        channel: {
          session: {
            recordInboundSession,
          },
          reply: {
            dispatchReplyWithBufferedBlockDispatcher,
          },
        },
      },
      deliver,
      onRecordError: vi.fn(),
      onDispatchError: vi.fn(),
      typing: typing as never,
    });

    expect(recordInboundSession).toHaveBeenCalledTimes(1);
    expect(mocks.createChannelReplyPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "vk",
        agentId: "main",
        typing,
      }),
    );
  });

  it("forwards explicit typing callbacks into the reply pipeline", async () => {
    const typingCallbacks = {
      startTyping: vi.fn(),
      stopTyping: vi.fn(),
    };

    await dispatchInboundReplyWithBase({
      cfg: {},
      channel: "vk",
      route: {
        agentId: "main",
        sessionKey: "agent:main:vk:dm:42",
      },
      storePath: "/tmp/session-store.json",
      ctxPayload: {
        SessionKey: "agent:main:vk:dm:42",
      } as never,
      core: {
        channel: {
          session: {
            recordInboundSession: vi.fn(async () => {}),
          },
          reply: {
            dispatchReplyWithBufferedBlockDispatcher: vi.fn(async () => ({
              queuedFinal: false,
              counts: {
                tool: 0,
                block: 0,
                final: 0,
              },
            })),
          },
        },
      },
      deliver: vi.fn(async () => {}),
      onRecordError: vi.fn(),
      onDispatchError: vi.fn(),
      typingCallbacks: typingCallbacks as never,
    });

    expect(mocks.createChannelReplyPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "vk",
        agentId: "main",
        typingCallbacks,
      }),
    );
  });
});
