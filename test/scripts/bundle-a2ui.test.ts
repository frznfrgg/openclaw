import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getLocalRolldownCliCandidates,
  isBundleHashInputPath,
  shouldStubMissingA2uiBundle,
} from "../../scripts/bundle-a2ui.mjs";

describe("scripts/bundle-a2ui.mjs", () => {
  it("keeps generated renderer output out of bundle hash inputs", () => {
    const repoRoot = path.resolve("repo-root");

    expect(
      isBundleHashInputPath(
        path.join(repoRoot, "vendor", "a2ui", "renderers", "lit", "src", "index.ts"),
        repoRoot,
      ),
    ).toBe(true);
    expect(
      isBundleHashInputPath(
        path.join(repoRoot, "vendor", "a2ui", "renderers", "lit", "dist"),
        repoRoot,
      ),
    ).toBe(false);
    expect(
      isBundleHashInputPath(
        path.join(repoRoot, "vendor", "a2ui", "renderers", "lit", "dist", "src", "index.js"),
        repoRoot,
      ),
    ).toBe(false);
  });

  it("prefers the installed rolldown CLI over a network dlx fallback", () => {
    const repoRoot = path.resolve("repo-root");

    expect(getLocalRolldownCliCandidates(repoRoot)[0]).toBe(
      path.join(repoRoot, "node_modules", "rolldown", "bin", "cli.mjs"),
    );
  });

  it("stubs missing A2UI bundles for source archives without git metadata", async () => {
    await expect(
      shouldStubMissingA2uiBundle({
        repoRoot: path.resolve("archive-root"),
        env: {},
      }),
    ).resolves.toBe(true);
  });

  it("keeps missing A2UI bundles fatal in git checkouts unless explicitly skipped", async () => {
    await expect(
      shouldStubMissingA2uiBundle({
        repoRoot: path.resolve("."),
        env: {},
      }),
    ).resolves.toBe(false);
    await expect(
      shouldStubMissingA2uiBundle({
        repoRoot: path.resolve("."),
        env: { OPENCLAW_A2UI_SKIP_MISSING: "1" },
      }),
    ).resolves.toBe(true);
  });
});
