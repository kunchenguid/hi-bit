import { type AxNode, buildSnapshot, type FrameTree, type RefTarget } from "./snapshot";

export type Rect = { x: number; y: number; width: number; height: number };

/** Which frames a snapshot should include. */
export type SnapshotScope = "all" | "top" | "children";

/**
 * The slice of Electron's `webContents.debugger` the controller drives. Injected
 * so the controller can be unit-tested against a fake CDP transport without an
 * Electron window. Electron's real debugger matches this shape one-to-one.
 */
export interface CdpDebugger {
  isAttached(): boolean;
  attach(protocolVersion?: string): void;
  detach(): void;
  sendCommand(
    method: string,
    params?: object,
    sessionId?: string,
  ): Promise<Record<string, unknown>>;
  on(
    event: "message",
    listener: (
      event: unknown,
      method: string,
      params: Record<string, unknown>,
      sessionId?: string,
    ) => void,
  ): void;
  on(event: "detach", listener: (event: unknown, reason: string) => void): void;
}

export type Point = { x: number; y: number };

/** A captured frame as base64 PNG, or null when there is nothing to capture. */
export type CapturePng = () => Promise<string | null>;

export type CdpControllerOptions = {
  debugger: CdpDebugger;
  /** Full-surface screenshot (e.g. Electron `capturePage`), already downscaled. */
  capture: CapturePng;
};

type ChildSession = { sessionId: string; parentKey: string; frameId?: string };

const TOP = "top";
const DOMAINS = ["Page", "DOM", "Runtime", "Accessibility", "Log"] as const;

/**
 * Drives one webContents over CDP: a merged accessibility snapshot across every
 * frame (top app frame + each cross-origin OOPIF), ref-based interaction
 * (resolve a ref to a viewport point through the frame-offset chain, then
 * dispatch coordinate input on the top session - input "bleeds" across the
 * cross-origin boundary, proven in the Phase 0 prototype), navigation, and
 * screenshots. Generic: Bit points it at the visible app webContents; each bot
 * points one at its own headless offscreen window.
 */
export class CdpController {
  private readonly dbg: CdpDebugger;
  private readonly capture: CapturePng;
  private readonly children = new Map<string, ChildSession>();
  private refs = new Map<string, RefTarget>();
  private readonly offsetCache = new Map<string, Point>();
  private readonly consoleBuffer: string[] = [];
  private attached = false;

  constructor(options: CdpControllerOptions) {
    this.dbg = options.debugger;
    this.capture = options.capture;
  }

  /** Attaches the debugger and turns on flattened auto-attach for OOPIFs. */
  async attach(): Promise<void> {
    if (this.attached) return;
    if (!this.dbg.isAttached()) this.dbg.attach("1.3");
    this.dbg.on("message", (_e, method, params, sessionId) => {
      this.onCdpMessage(method, params, sessionId);
    });
    this.dbg.on("detach", () => {
      this.attached = false;
      this.children.clear();
    });
    await this.enableDomains(undefined);
    await this.setAutoAttach(undefined);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    try {
      this.dbg.detach();
    } catch {
      // Already gone.
    }
    this.attached = false;
    this.children.clear();
  }

  isAttached(): boolean {
    return this.attached;
  }

  private async enableDomains(sessionId: string | undefined): Promise<void> {
    for (const domain of DOMAINS) {
      try {
        await this.dbg.sendCommand(`${domain}.enable`, {}, sessionId);
      } catch {
        // Some domains are unavailable on some targets; ignore.
      }
    }
  }

  private async setAutoAttach(sessionId: string | undefined): Promise<void> {
    try {
      await this.dbg.sendCommand(
        "Target.setAutoAttach",
        { autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
        sessionId,
      );
    } catch {
      // Older targets may not support auto-attach; top-frame still works.
    }
  }

  private onCdpMessage(
    method: string,
    params: Record<string, unknown>,
    arrivedOn: string | undefined,
  ): void {
    if (method === "Target.attachedToTarget") {
      const childId = (params.sessionId as string) ?? "";
      const info = params.targetInfo as { targetId?: string; type?: string } | undefined;
      if (!childId || (info?.type !== "iframe" && info?.type !== "page")) return;
      this.children.set(childId, {
        sessionId: childId,
        parentKey: arrivedOn ?? TOP,
        frameId: info?.targetId,
      });
      // Prepare the new frame: enable domains + recurse auto-attach for nesting.
      void this.enableDomains(childId);
      void this.setAutoAttach(childId);
      return;
    }
    if (method === "Target.detachedFromTarget") {
      const childId = params.sessionId as string | undefined;
      if (childId) {
        this.children.delete(childId);
        this.offsetCache.delete(childId);
      }
      return;
    }
    if (method === "Runtime.consoleAPICalled") {
      const level = (params.type as string) ?? "log";
      const args = (params.args as Array<{ value?: unknown }> | undefined) ?? [];
      const text = args.map((a) => stringifyArg(a.value)).join(" ");
      this.pushConsole(`[${level}] ${text}`);
      return;
    }
    if (method === "Log.entryAdded") {
      const entry = params.entry as { level?: string; text?: string } | undefined;
      if (entry?.text) this.pushConsole(`[${entry.level ?? "log"}] ${entry.text}`);
    }
  }

  private pushConsole(line: string): void {
    this.consoleBuffer.push(line);
    if (this.consoleBuffer.length > 200) this.consoleBuffer.shift();
  }

  /** Recent console + log lines captured across every frame since attach. */
  recentConsole(limit = 50): string[] {
    return this.consoleBuffer.slice(-limit);
  }

  private send(method: string, params: object, frameKey: string): Promise<Record<string, unknown>> {
    return this.dbg.sendCommand(method, params, frameKey === TOP ? undefined : frameKey);
  }

  private allFrameKeys(): string[] {
    return [TOP, ...this.children.keys()];
  }

  private frameKeysUnder(rootFrameKey: string): string[] {
    const keys = [rootFrameKey];
    for (const [key, child] of this.children) {
      if (child.parentKey === rootFrameKey) keys.push(...this.frameKeysUnder(key));
    }
    return keys;
  }

  private async snapshotKeys(keys: string[]): Promise<string> {
    this.offsetCache.clear();
    const frames: FrameTree[] = [];
    for (const frameKey of keys) {
      try {
        const url = await this.frameUrl(frameKey);
        const ax = (await this.send("Accessibility.getFullAXTree", {}, frameKey)) as {
          nodes?: AxNode[];
        };
        frames.push({ frameKey, url, nodes: ax.nodes ?? [] });
      } catch {
        // A frame can vanish mid-snapshot (navigation); skip it.
      }
    }
    const snap = buildSnapshot(frames);
    this.refs = snap.refs;
    return snap.text;
  }

  /** Pulls accessibility trees for the chosen frames and builds the ref'd text. */
  async snapshot(scope: SnapshotScope = "all"): Promise<string> {
    const keys = this.allFrameKeys().filter((key) =>
      scope === "all" ? true : scope === "top" ? key === TOP : key !== TOP,
    );
    return this.snapshotKeys(keys);
  }

  async snapshotFrame(frameKey: string): Promise<string> {
    return this.snapshotKeys(this.frameKeysUnder(frameKey));
  }

  private async frameUrl(frameKey: string): Promise<string> {
    try {
      const tree = (await this.send("Page.getFrameTree", {}, frameKey)) as {
        frameTree?: { frame?: { url?: string } };
      };
      return tree.frameTree?.frame?.url ?? "";
    } catch {
      return "";
    }
  }

  /** Resolves a snapshot ref to a viewport point, composing the frame offsets. */
  async resolveCenter(ref: string): Promise<Point> {
    const target = this.refs.get(ref);
    if (!target) throw new Error(`Unknown element ref "${ref}". Take a fresh snapshot first.`);
    const center = await this.boxCenter(target.frameKey, target.backendDOMNodeId);
    const offset = await this.offsetFor(target.frameKey);
    return { x: center.x + offset.x, y: center.y + offset.y };
  }

  /** Resolves a ref to its bounding rect in top-viewport coords (for spotlights). */
  async resolveRect(ref: string): Promise<Rect> {
    const target = this.refs.get(ref);
    if (!target) throw new Error(`Unknown element ref "${ref}". Take a fresh snapshot first.`);
    const box = (await this.send(
      "DOM.getBoxModel",
      { backendNodeId: target.backendDOMNodeId },
      target.frameKey,
    )) as { model?: { content?: number[]; border?: number[] } };
    // The border box is the element's full visible extent (content box excludes
    // padding + border, which would make the spotlight narrower than the button).
    const q = box.model?.border ?? box.model?.content;
    if (!q || q.length < 8) throw new Error("Element has no box (not visible).");
    const xs = [q[0], q[2], q[4], q[6]];
    const ys = [q[1], q[3], q[5], q[7]];
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const offset = await this.offsetFor(target.frameKey);
    return {
      x: minX + offset.x,
      y: minY + offset.y,
      width: Math.max(...xs) - minX,
      height: Math.max(...ys) - minY,
    };
  }

  private async boxCenter(frameKey: string, backendNodeId: number): Promise<Point> {
    const box = (await this.send("DOM.getBoxModel", { backendNodeId }, frameKey)) as {
      model?: { content?: number[] };
    };
    const q = box.model?.content;
    if (!q || q.length < 8) throw new Error("Element has no box (not visible).");
    return { x: (q[0] + q[2] + q[4] + q[6]) / 4, y: (q[1] + q[3] + q[5] + q[7]) / 4 };
  }

  /** The frame's top-left in top-viewport coords, walking up the OOPIF chain. */
  private async offsetFor(frameKey: string): Promise<Point> {
    if (frameKey === TOP) return { x: 0, y: 0 };
    const cached = this.offsetCache.get(frameKey);
    if (cached) return cached;
    const child = this.children.get(frameKey);
    if (!child?.frameId) return { x: 0, y: 0 };
    let own: Point = { x: 0, y: 0 };
    try {
      const owner = (await this.send(
        "DOM.getFrameOwner",
        { frameId: child.frameId },
        child.parentKey,
      )) as { backendNodeId?: number };
      if (typeof owner.backendNodeId === "number") {
        const box = (await this.send(
          "DOM.getBoxModel",
          { backendNodeId: owner.backendNodeId },
          child.parentKey,
        )) as { model?: { content?: number[] } };
        const q = box.model?.content;
        if (q && q.length >= 2) own = { x: q[0], y: q[1] };
      }
    } catch {
      // Owner lookup failed; treat as no offset (best effort).
    }
    const parentOffset = await this.offsetFor(child.parentKey);
    const result = { x: own.x + parentOffset.x, y: own.y + parentOffset.y };
    this.offsetCache.set(frameKey, result);
    return result;
  }

  private async mouse(type: string, p: Point, extra: object = {}): Promise<void> {
    await this.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, ...extra }, TOP);
  }

  /** Clicks the element a ref points at (coordinate input on the top session). */
  async click(ref: string): Promise<void> {
    const p = await this.resolveCenter(ref);
    await this.mouse("mouseMoved", p);
    await this.mouse("mousePressed", p, { button: "left", clickCount: 1 });
    await this.mouse("mouseReleased", p, { button: "left", clickCount: 1 });
  }

  async hover(ref: string): Promise<void> {
    await this.mouse("mouseMoved", await this.resolveCenter(ref));
  }

  /** Types into whatever is focused (use after click/fill to target a field). */
  async type(text: string): Promise<void> {
    await this.send("Input.insertText", { text }, TOP);
  }

  /** Focuses a field by ref, clears it, and types `text`. */
  async fill(ref: string, text: string): Promise<void> {
    await this.click(ref);
    await this.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Delete" }, TOP);
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Delete" }, TOP);
    await this.send("Input.insertText", { text }, TOP);
  }

  /** Presses a key or chord like "Enter", "Tab", "Control+a", "ArrowDown". */
  async press(key: string): Promise<void> {
    const parts = key.split("+");
    const main = parts[parts.length - 1];
    const modifiers = modifierMask(parts.slice(0, -1));
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key: main, modifiers }, TOP);
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key: main, modifiers }, TOP);
  }

  async scroll(direction: "up" | "down", amount = 400): Promise<void> {
    const deltaY = direction === "down" ? amount : -amount;
    await this.mouse("mouseWheel", { x: 200, y: 200 }, { deltaX: 0, deltaY });
  }

  /** Navigates a frame (top by default - used by the headless bot target). */
  async navigate(url: string, frameKey = TOP): Promise<void> {
    await this.send("Page.navigate", { url }, frameKey);
  }

  async back(frameKey = TOP): Promise<void> {
    const history = (await this.send("Page.getNavigationHistory", {}, frameKey)) as {
      currentIndex?: number;
      entries?: Array<{ id?: number }>;
    };
    const index = (history.currentIndex ?? 0) - 1;
    const entry = history.entries?.[index];
    if (entry?.id !== undefined) {
      await this.send("Page.navigateToHistoryEntry", { entryId: entry.id }, frameKey);
    }
  }

  async reload(frameKey = TOP): Promise<void> {
    await this.send("Page.reload", {}, frameKey);
  }

  async currentUrl(frameKey = TOP): Promise<string> {
    return this.frameUrl(frameKey);
  }

  /** Evaluates JS in a frame and returns the value (best effort). */
  async evaluate(expression: string, frameKey = TOP): Promise<unknown> {
    const result = (await this.send(
      "Runtime.evaluate",
      { expression, returnByValue: true },
      frameKey,
    )) as { result?: { value?: unknown } };
    return result.result?.value;
  }

  /** The frame key whose URL matches (or starts with) `url`, if attached. */
  async findFrameKeyByUrl(url: string): Promise<string | undefined> {
    for (const frameKey of this.allFrameKeys()) {
      const frameUrl = await this.frameUrl(frameKey);
      if (frameUrl && (frameUrl === url || frameUrl.startsWith(url))) return frameKey;
    }
    return undefined;
  }

  async childFrameUrls(): Promise<Array<{ frameKey: string; url: string }>> {
    const urls: Array<{ frameKey: string; url: string }> = [];
    for (const frameKey of this.children.keys()) {
      const url = await this.frameUrl(frameKey);
      if (url) urls.push({ frameKey, url });
    }
    return urls;
  }

  async firstDisallowedFrameUrl(
    isAllowed: (url: string) => boolean | Promise<boolean>,
    rootFrameKey?: string,
  ): Promise<string | null> {
    const frameKeys = rootFrameKey ? this.frameKeysUnder(rootFrameKey) : this.allFrameKeys();
    for (const frameKey of frameKeys) {
      const url = await this.frameUrl(frameKey);
      if (url && !(await isAllowed(url))) return url;
    }
    return null;
  }

  /** The readable text of a frame (its document.body.innerText). */
  async readText(frameKey = TOP): Promise<string> {
    const value = await this.evaluate("document.body ? document.body.innerText : ''", frameKey);
    return typeof value === "string" ? value : "";
  }

  async screenshotFrame(frameKey: string): Promise<string | null> {
    if (frameKey === TOP) return this.screenshot();
    const rect = await this.frameViewportRect(frameKey);
    if (!rect) return null;
    try {
      const result = (await this.send(
        "Page.captureScreenshot",
        { format: "png", clip: { ...rect, scale: 1 }, fromSurface: true },
        TOP,
      )) as { data?: string };
      return result.data ?? null;
    } catch {
      return null;
    }
  }

  private async frameViewportRect(frameKey: string): Promise<Rect | null> {
    const child = this.children.get(frameKey);
    if (!child?.frameId) return null;
    try {
      const owner = (await this.send(
        "DOM.getFrameOwner",
        { frameId: child.frameId },
        child.parentKey,
      )) as { backendNodeId?: number };
      if (typeof owner.backendNodeId !== "number") return null;
      const box = (await this.send(
        "DOM.getBoxModel",
        { backendNodeId: owner.backendNodeId },
        child.parentKey,
      )) as { model?: { content?: number[]; border?: number[] } };
      const q = box.model?.content ?? box.model?.border;
      if (!q || q.length < 8) return null;
      const xs = [q[0], q[2], q[4], q[6]];
      const ys = [q[1], q[3], q[5], q[7]];
      const offset = await this.offsetFor(child.parentKey);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return {
        x: minX + offset.x,
        y: minY + offset.y,
        width: Math.max(...xs) - minX,
        height: Math.max(...ys) - minY,
      };
    } catch {
      return null;
    }
  }

  /** Full-surface screenshot as base64 PNG. */
  screenshot(): Promise<string | null> {
    return this.capture();
  }
}

function modifierMask(names: string[]): number {
  let mask = 0;
  for (const name of names) {
    const lower = name.toLowerCase();
    if (lower === "alt") mask |= 1;
    else if (lower === "control" || lower === "ctrl") mask |= 2;
    else if (lower === "meta" || lower === "cmd" || lower === "command") mask |= 4;
    else if (lower === "shift") mask |= 8;
  }
  return mask;
}

function stringifyArg(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
}
