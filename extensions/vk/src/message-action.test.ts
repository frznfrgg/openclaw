import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../../src/config/config.js";
import { sendVkMedia } from "./send.js";

const outboundMediaMocks = vi.hoisted(() => ({
  loadOutboundMediaFromUrl: vi.fn(),
}));

vi.mock("openclaw/plugin-sdk/outbound-media", () => ({
  loadOutboundMediaFromUrl: outboundMediaMocks.loadOutboundMediaFromUrl,
}));

const baseCfg = {
  channels: {
    vk: {
      enabled: true,
      communityId: "123",
      communityAccessToken: "vk-token",
    },
  },
} as OpenClawConfig;

describe("VK message action sends attachments", () => {
  beforeEach(() => {
    outboundMediaMocks.loadOutboundMediaFromUrl.mockReset();
    outboundMediaMocks.loadOutboundMediaFromUrl.mockResolvedValue({
      buffer: Buffer.from("pdf-bytes"),
      contentType: "application/pdf",
      fileName: "report.pdf",
      kind: "document",
    });
  });

  it("sends a local PDF through VK document upload helpers", async () => {
    const sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), "vk-message-action-"));
    try {
      const pdfPath = path.join(sandboxDir, "workspace", "files", "report.pdf");
      await fs.mkdir(path.dirname(pdfPath), { recursive: true });
      await fs.writeFile(
        pdfPath,
        Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "utf8"),
      );

      const fetcher = vi
        .fn()
        .mockImplementationOnce(async (_input: RequestInfo | URL, init?: RequestInit) => {
          const body = new URLSearchParams(String(init?.body));
          expect(body.get("type")).toBe("doc");
          expect(body.get("peer_id")).toBe("597545525");
          expect(body.get("access_token")).toBe("vk-token");
          return new Response(
            JSON.stringify({ response: { upload_url: "https://upload.vk.test/doc" } }),
            { status: 200 },
          );
        })
        .mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
          expect(String(input)).toBe("https://upload.vk.test/doc");
          const form = init?.body as FormData;
          expect(form.get("file")).toBeTruthy();
          return new Response(JSON.stringify({ file: "file-token-1" }), { status: 200 });
        })
        .mockImplementationOnce(async (_input: RequestInfo | URL, init?: RequestInit) => {
          const body = new URLSearchParams(String(init?.body));
          expect(body.get("file")).toBe("file-token-1");
          expect(body.get("title")).toBe("report");
          return new Response(JSON.stringify({ response: { doc: { id: 55, owner_id: -123 } } }), {
            status: 200,
          });
        })
        .mockImplementationOnce(async (_input: RequestInfo | URL, init?: RequestInit) => {
          const body = new URLSearchParams(String(init?.body));
          expect(body.get("peer_id")).toBe("597545525");
          expect(body.get("attachment")).toBe("doc-123_55");
          expect(body.get("message")).toBe("Here it is.");
          return new Response(JSON.stringify({ response: 777 }), { status: 200 });
        });

      vi.stubGlobal("fetch", fetcher as typeof fetch);

      const result = await sendVkMedia({
        cfg: baseCfg,
        to: "vk:user:597545525",
        text: "Here it is.",
        mediaUrl: pdfPath,
        mediaLocalRoots: [path.join(sandboxDir, "workspace")],
      });

      expect(result).toMatchObject({
        channel: "vk",
        messageId: "777",
        chatId: "597545525",
        conversationId: "vk:user:597545525",
      });
      expect(fetcher).toHaveBeenCalledTimes(4);
      expect(outboundMediaMocks.loadOutboundMediaFromUrl).toHaveBeenCalledWith(pdfPath, {
        maxBytes: 200 * 1024 * 1024,
        mediaLocalRoots: [path.join(sandboxDir, "workspace")],
      });
    } finally {
      await fs.rm(sandboxDir, { recursive: true, force: true });
    }
  });
});
