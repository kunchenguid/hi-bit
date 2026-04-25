import { describe, expect, it } from "vitest";
import { describeExportResult } from "./exportProfileStatus";

describe("describeExportResult", () => {
  it("reports canceled when the IPC returns null", () => {
    expect(describeExportResult(null)).toEqual({ kind: "canceled" });
  });

  it("extracts the last POSIX path segment as the folder name", () => {
    const result = describeExportResult("/Users/kun/exports/ada-2026-04-23T10-30-00-000Z");
    expect(result).toEqual({
      kind: "success",
      path: "/Users/kun/exports/ada-2026-04-23T10-30-00-000Z",
      folderName: "ada-2026-04-23T10-30-00-000Z",
    });
  });

  it("extracts the last Windows path segment as the folder name", () => {
    const result = describeExportResult("C:\\Users\\kun\\exports\\ada-2026-04-23T10-30-00-000Z");
    expect(result).toEqual({
      kind: "success",
      path: "C:\\Users\\kun\\exports\\ada-2026-04-23T10-30-00-000Z",
      folderName: "ada-2026-04-23T10-30-00-000Z",
    });
  });

  it("trims a trailing path separator before picking the folder name", () => {
    const result = describeExportResult("/Users/kun/exports/ada-2026-04-23/");
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.folderName).toBe("ada-2026-04-23");
    }
  });

  it("falls back to the full string when no separator is present", () => {
    const result = describeExportResult("ada-2026-04-23");
    expect(result).toEqual({
      kind: "success",
      path: "ada-2026-04-23",
      folderName: "ada-2026-04-23",
    });
  });
});
