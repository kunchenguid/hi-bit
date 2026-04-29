import { describe, expect, it, vi } from "vitest";
import {
  createHiBitControlStreamFilter,
  extractHiBitControlBlocks,
  stripHiBitControlBlocks,
} from "./hiBitControl";

describe("hi-bit control blocks", () => {
  it("extracts namespaced control blocks and strips them from visible text", () => {
    const text =
      'Nice work.<hi-bit:progress>{"kpId":"html-text-headings"}</hi-bit:progress> Next step.';

    expect(stripHiBitControlBlocks(text)).toBe("Nice work. Next step.");
    expect(extractHiBitControlBlocks(text)).toEqual([
      {
        name: "progress",
        raw: '<hi-bit:progress>{"kpId":"html-text-headings"}</hi-bit:progress>',
        body: '{"kpId":"html-text-headings"}',
      },
    ]);
  });

  it("hides control blocks across streaming chunk boundaries", () => {
    const onVisible = vi.fn();
    const filter = createHiBitControlStreamFilter(onVisible);

    filter.push("Nice <hi");
    filter.push('-bit:progress>[{"kpId":"html-text-headings"}]');
    filter.push("</hi-bit:progress> done.");
    filter.finish();

    expect(onVisible.mock.calls.map(([text]) => text).join("")).toBe("Nice  done.");
  });

  it("recognizes hidden control close tags split across streaming chunks", () => {
    const onVisible = vi.fn();
    const filter = createHiBitControlStreamFilter(onVisible);

    filter.push("Nice <hi-bit:progress>{}");
    filter.push("</hi-bit:prog");
    filter.push("ress> done.");
    filter.finish();

    expect(onVisible.mock.calls.map(([text]) => text).join("")).toBe("Nice  done.");
  });

  it("flushes a partial non-control tag as visible text", () => {
    const onVisible = vi.fn();
    const filter = createHiBitControlStreamFilter(onVisible);

    filter.push("Use <hi there");
    filter.finish();

    expect(onVisible.mock.calls.map(([text]) => text).join("")).toBe("Use <hi there");
  });
});
