import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { BrowserHost } from "../control/browserHost";

/**
 * The `browser_*` tool family - an in-app browser shaped like `chrome-devtools-axi`.
 * Bit drives visible tabs; bots drive headless ones. Both reach the same
 * `BrowserHost`. Navigation is allowlist-gated inside the host, so a refused load
 * comes back as plain text the model can relay, never an unhandled throw.
 *
 * Snapshot returns refs (`[e7] button "Start"`); click/fill/press act on a ref or
 * the focused field. Reads return the page's text so the model can answer
 * "what does this page say".
 */
export function createBrowserTools(host: BrowserHost): ToolDefinition[] {
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
      name: "browser_open_tab",
      label: "Open a browser tab",
      description:
        "Open a new browser tab. Pass a creation preview loopback url or grown-up-approved website to load it, or leave it empty for a blank tab. Other websites are refused.",
      parameters: Type.Object({
        url: Type.Optional(
          Type.String({ description: "The page to load, or empty for a blank tab." }),
        ),
      }),
      executionMode: "sequential",
      async execute(_callId, params) {
        try {
          const tab = await host.openTab(params.url);
          return ok(`Opened tab ${tab.id}${tab.url ? ` at ${tab.url}` : ""}.`);
        } catch (error) {
          return fail(error);
        }
      },
    }),
    defineTool({
      name: "browser_list_tabs",
      label: "List browser tabs",
      description: "List every open browser tab with its id, title, and url.",
      parameters: Type.Object({}),
      executionMode: "parallel",
      async execute() {
        try {
          const tabs = await host.listTabs();
          if (!tabs.length) return ok("No tabs are open.");
          return ok(tabs.map((t) => `${t.id}: ${t.title ?? "(untitled)"} - ${t.url}`).join("\n"));
        } catch (error) {
          return fail(error);
        }
      },
    }),
    defineTool({
      name: "browser_switch_tab",
      label: "Switch browser tab",
      description: "Make a different open tab the active one (by tab id).",
      parameters: Type.Object({ tabId: Type.String() }),
      executionMode: "sequential",
      async execute(_callId, params) {
        try {
          await host.switchTab(params.tabId);
          return ok(`Switched to tab ${params.tabId}.`);
        } catch (error) {
          return fail(error);
        }
      },
    }),
    defineTool({
      name: "browser_close_tab",
      label: "Close a browser tab",
      description: "Close an open browser tab by id.",
      parameters: Type.Object({ tabId: Type.String() }),
      executionMode: "sequential",
      async execute(_callId, params) {
        try {
          await host.closeTab(params.tabId);
          return ok(`Closed tab ${params.tabId}.`);
        } catch (error) {
          return fail(error);
        }
      },
    }),
    defineTool({
      name: "browser_navigate",
      label: "Go to a page",
      description:
        "Navigate the active tab to a creation preview loopback url or grown-up-approved website. Other websites are refused.",
      parameters: Type.Object({ url: Type.String() }),
      executionMode: "sequential",
      async execute(_callId, params) {
        try {
          await host.navigate(params.url);
          return ok(`Loaded ${params.url}.`);
        } catch (error) {
          return fail(error);
        }
      },
    }),
    defineTool({
      name: "browser_back",
      label: "Go back",
      description: "Go back one page in the active tab.",
      parameters: Type.Object({}),
      executionMode: "sequential",
      async execute() {
        try {
          await host.back();
          return ok("Went back.");
        } catch (error) {
          return fail(error);
        }
      },
    }),
    defineTool({
      name: "browser_reload",
      label: "Reload the page",
      description: "Reload the active tab.",
      parameters: Type.Object({}),
      executionMode: "sequential",
      async execute() {
        try {
          await host.reload();
          return ok("Reloaded.");
        } catch (error) {
          return fail(error);
        }
      },
    }),
    defineTool({
      name: "browser_snapshot",
      label: "Look at the page",
      description:
        "Get a structured snapshot of the active tab: every clickable/typeable element with a ref like [e7]. Use the refs with browser_click and browser_fill. Take a fresh snapshot after the page changes.",
      parameters: Type.Object({}),
      executionMode: "parallel",
      async execute() {
        try {
          const text = await host.snapshot();
          return ok(text || "The page has no readable elements yet.");
        } catch (error) {
          return fail(error);
        }
      },
    }),
    defineTool({
      name: "browser_click",
      label: "Click on the page",
      description: "Click the element with the given ref (from browser_snapshot).",
      parameters: Type.Object({
        ref: Type.String({ description: "A ref like e7 from the snapshot." }),
      }),
      executionMode: "sequential",
      async execute(_callId, params) {
        try {
          await host.click(params.ref);
          return ok(`Clicked ${params.ref}.`);
        } catch (error) {
          return fail(error);
        }
      },
    }),
    defineTool({
      name: "browser_fill",
      label: "Type into a field",
      description: "Click a field (by ref) and type text into it, replacing what was there.",
      parameters: Type.Object({ ref: Type.String(), text: Type.String() }),
      executionMode: "sequential",
      async execute(_callId, params) {
        try {
          await host.fill(params.ref, params.text);
          return ok(`Typed into ${params.ref}.`);
        } catch (error) {
          return fail(error);
        }
      },
    }),
    defineTool({
      name: "browser_type",
      label: "Type",
      description: "Type text wherever the cursor currently is on the page.",
      parameters: Type.Object({ text: Type.String() }),
      executionMode: "sequential",
      async execute(_callId, params) {
        try {
          await host.type(params.text);
          return ok("Typed.");
        } catch (error) {
          return fail(error);
        }
      },
    }),
    defineTool({
      name: "browser_press",
      label: "Press a key",
      description:
        'Press a key or chord on the page, like "Enter", "Tab", "ArrowDown", or "Control+a".',
      parameters: Type.Object({ key: Type.String() }),
      executionMode: "sequential",
      async execute(_callId, params) {
        try {
          await host.press(params.key);
          return ok(`Pressed ${params.key}.`);
        } catch (error) {
          return fail(error);
        }
      },
    }),
    defineTool({
      name: "browser_scroll",
      label: "Scroll the page",
      description: 'Scroll the active tab "up" or "down".',
      parameters: Type.Object({
        direction: Type.Union([Type.Literal("up"), Type.Literal("down")]),
      }),
      executionMode: "sequential",
      async execute(_callId, params) {
        try {
          await host.scroll(params.direction);
          return ok(`Scrolled ${params.direction}.`);
        } catch (error) {
          return fail(error);
        }
      },
    }),
    defineTool({
      name: "browser_read",
      label: "Read the page",
      description:
        "Read the readable text of the active tab, so you can answer questions about what the page says.",
      parameters: Type.Object({}),
      executionMode: "parallel",
      async execute() {
        try {
          const text = await host.read();
          return ok(text || "The page has no readable text.");
        } catch (error) {
          return fail(error);
        }
      },
    }),
    defineTool({
      name: "browser_screenshot",
      label: "Take a screenshot",
      description: "Take a picture of the active tab so you can see what it looks like.",
      parameters: Type.Object({}),
      executionMode: "parallel",
      async execute() {
        try {
          const data = await host.screenshot();
          if (!data) return ok("Couldn't capture the page right now.");
          return {
            content: [
              { type: "text" as const, text: "This is the active browser tab." },
              { type: "image" as const, data, mimeType: "image/png" },
            ],
            details: {},
          };
        } catch (error) {
          return fail(error);
        }
      },
    }),
    defineTool({
      name: "browser_console",
      label: "Read the console",
      description: "Read the recent JavaScript console and log messages from the active tab.",
      parameters: Type.Object({}),
      executionMode: "parallel",
      async execute() {
        try {
          const lines = await host.console();
          return ok(lines.length ? lines.join("\n") : "The console is empty.");
        } catch (error) {
          return fail(error);
        }
      },
    }),
  ];
}
