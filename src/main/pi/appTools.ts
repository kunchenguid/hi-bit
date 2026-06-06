import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/**
 * What the `app_*` tools need from the control engine. Bit-only: these observe
 * and *spotlight* the app for the kid - there is deliberately no app_click. Bit
 * never drives the app's own UI; it points at it so the kid does the tapping.
 */
export interface AppSurface {
  /** Whole-app screenshot as base64 PNG (the old `view_screen`). */
  screenshot(): Promise<string | null>;
  /** Accessibility snapshot of the app chrome (top frame only), with refs. */
  snapshotChrome(): Promise<string>;
  /** Draw a spotlight on the element a ref points at. Returns false if it's gone. */
  highlight(ref: string, label?: string): Promise<boolean>;
  /** Remove any active spotlight. */
  clearHighlight(): Promise<void>;
}

/**
 * `app_screenshot`, `app_snapshot`, `app_highlight`, `app_clear_highlight`.
 * Together they let Bit see the app and guide the kid ("tap *this* button")
 * without ever clicking for them.
 */
export function createAppTools(surface: AppSurface): ToolDefinition[] {
  const ok = (text: string) => ({ content: [{ type: "text" as const, text }], details: {} });
  const fail = (error: unknown) => ({
    content: [
      { type: "text" as const, text: error instanceof Error ? error.message : String(error) },
    ],
    isError: true,
    details: {},
  });

  return [
    defineTool({
      name: "app_screenshot",
      label: "Look at the screen",
      description:
        'Take a picture of the whole Hi-Bit app screen the builder is looking at right now - the chat, the buttons and layout, and the live creation preview if one is open - so you can actually see what they see. Call it when the builder describes something visual about the app or their creation ("this looks weird", "the button is in the wrong place") and you need to look before answering. Use it when it helps, not on every turn.',
      parameters: Type.Object({}),
      executionMode: "parallel",
      async execute() {
        const data = await surface.screenshot();
        if (!data) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Couldn't capture the screen right now - there's no live app window to look at.",
              },
            ],
            details: { source: "app_screen", captured: false },
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: "This is the whole Hi-Bit screen the builder is looking at right now, including the live preview if one is open.",
            },
            { type: "image" as const, data, mimeType: "image/png" },
          ],
          details: { source: "app_screen", captured: true },
        };
      },
    }),
    defineTool({
      name: "app_snapshot",
      label: "Find things on the screen",
      description:
        "Get a structured list of the app's own buttons and controls, each with a ref like [e3]. Use it to find the exact thing you want to point the builder at, then call app_highlight with that ref. This sees the app chrome only - use browser_snapshot for what's inside a creation or website.",
      parameters: Type.Object({}),
      executionMode: "parallel",
      async execute() {
        try {
          const text = await surface.snapshotChrome();
          return ok(text || "Couldn't read the app's controls right now.");
        } catch (error) {
          return fail(error);
        }
      },
    }),
    defineTool({
      name: "app_highlight",
      label: "Point at something",
      description:
        "Draw a friendly spotlight around one of the app's buttons or controls (by a ref from app_snapshot) so the builder can see exactly what to tap. Add a short label to caption it. You never tap things yourself - you point, and the builder taps.",
      parameters: Type.Object({
        ref: Type.String({ description: "A ref like e3 from app_snapshot." }),
        label: Type.Optional(
          Type.String({ description: "A short caption, e.g. 'Tap here to play'." }),
        ),
      }),
      executionMode: "sequential",
      async execute(_callId, params) {
        try {
          const shown = await surface.highlight(params.ref, params.label);
          return ok(
            shown
              ? `Spotlighting ${params.ref} for the builder.`
              : `Couldn't find ${params.ref} on screen - take a fresh app_snapshot.`,
          );
        } catch (error) {
          return fail(error);
        }
      },
    }),
    defineTool({
      name: "app_clear_highlight",
      label: "Stop pointing",
      description: "Remove the spotlight you drew with app_highlight.",
      parameters: Type.Object({}),
      executionMode: "sequential",
      async execute() {
        try {
          await surface.clearHighlight();
          return ok("Cleared the spotlight.");
        } catch (error) {
          return fail(error);
        }
      },
    }),
  ];
}
