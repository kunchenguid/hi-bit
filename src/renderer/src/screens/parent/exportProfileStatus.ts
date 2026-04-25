export type ExportProfileResult =
  | { kind: "success"; path: string; folderName: string }
  | { kind: "canceled" };

export function describeExportResult(result: string | null): ExportProfileResult {
  if (result === null) {
    return { kind: "canceled" };
  }
  const trimmed = result.replace(/[\\/]+$/, "");
  const segments = trimmed.split(/[\\/]/);
  const folderName = segments[segments.length - 1] ?? trimmed;
  return { kind: "success", path: result, folderName };
}
