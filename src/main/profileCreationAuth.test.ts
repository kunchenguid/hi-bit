import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireParentPinForProfileCreation } from "./profileCreationAuth";
import { bootstrapLayout, type HiBitLayout } from "./storage/layout";
import { setParentPin } from "./storage/parentPin";

const TEST_OPTS = { iterations: 100, keyLength: 16, saltBytes: 8 };

describe("profile creation authorization", () => {
  let root: string;
  let layout: HiBitLayout;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-profile-auth-"));
    layout = await bootstrapLayout(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("rejects profile creation without the parent PIN", async () => {
    await setParentPin(layout, "1234", TEST_OPTS);

    await expect(requireParentPinForProfileCreation(layout, undefined)).rejects.toThrow(
      "Parent PIN is required to create learners",
    );
  });

  it("rejects profile creation with an incorrect parent PIN", async () => {
    await setParentPin(layout, "1234", TEST_OPTS);

    await expect(requireParentPinForProfileCreation(layout, "4321")).rejects.toThrow(
      "Parent PIN is required to create learners",
    );
  });

  it("allows profile creation with the correct parent PIN", async () => {
    await setParentPin(layout, "1234", TEST_OPTS);

    await expect(requireParentPinForProfileCreation(layout, "1234")).resolves.toBeUndefined();
  });
});
