/**
 * The hook a picture-producing tool (`search_image`, `generate_image`) uses to
 * persist what it found or made into the profile's shared image store, getting
 * back a stable id the model can reuse as a reference later - including from a
 * different creation.
 *
 * The runtime supplies the implementation: it maps the tool's `cwd` to the
 * profile running there and calls the store's `saveImage`. It resolves to
 * `undefined` (a no-op) when no profile is registered for the cwd, so the tool
 * degrades gracefully instead of failing a search or a draw.
 */
export type PersistImageInput = {
  data: string;
  mimeType: string;
  source: "searched" | "generated";
  /** Provenance (search query or generation prompt) so the picture can be recalled. */
  meta?: Record<string, unknown>;
};

export type PersistImage = (
  cwd: string,
  input: PersistImageInput,
) => Promise<{ id: string } | undefined>;
