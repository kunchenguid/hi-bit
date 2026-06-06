/**
 * Merges the per-frame accessibility trees the CDP controller pulls (one tree per
 * session - the top app frame plus every cross-origin OOPIF) into a single
 * compact, model-readable snapshot with stable refs. A ref points back at
 * (frameKey, backendDOMNodeId) so the controller can resolve it to a box and
 * dispatch input - the same shape `chrome-devtools-axi snapshot` returns.
 *
 * Pure on purpose: the controller does the CDP I/O, this just shapes the text.
 */

/** The slice of a CDP `Accessibility` node this module reads. */
export type AxNode = {
  nodeId: string;
  ignored?: boolean;
  role?: { value?: string };
  name?: { value?: string };
  value?: { value?: string };
  backendDOMNodeId?: number;
  childIds?: string[];
};

/** One frame's accessibility tree, tagged with the session it came from. */
export type FrameTree = {
  /** "top" for the app frame, or a child session id for an OOPIF. */
  frameKey: string;
  url: string;
  nodes: AxNode[];
};

/** Where a ref resolves to, so the controller can target input/box queries. */
export type RefTarget = { frameKey: string; backendDOMNodeId: number };

export type Snapshot = {
  /** Indented, ref-annotated text handed to the model. */
  text: string;
  /** ref -> the element it names. */
  refs: Map<string, RefTarget>;
};

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textarea",
]);

/** Roles that are pure structure - never worth a line of their own. */
const SKIP_ROLES = new Set(["none", "generic", "InlineTextBox", "LineBreak", "presentation"]);

function isMeaningful(node: AxNode): boolean {
  if (node.ignored) return false;
  const role = node.role?.value;
  if (!role || SKIP_ROLES.has(role)) return false;
  const named = Boolean(node.name?.value?.trim());
  return named || INTERACTIVE_ROLES.has(role);
}

function buildLine(ref: string | null, node: AxNode, depth: number): string {
  const indent = "  ".repeat(depth);
  const role = node.role?.value ?? "node";
  const name = node.name?.value?.trim();
  const namePart = name ? ` "${name}"` : "";
  const value = node.value?.value?.trim();
  const valuePart = value ? ` (value: ${value})` : "";
  const refPart = ref ? `[${ref}] ` : "";
  return `${indent}${refPart}${role}${namePart}${valuePart}`;
}

/**
 * Builds the merged snapshot. Frames render in order (top first); each non-top
 * frame gets a `# frame:` header so the model can tell creation/website content
 * apart from the app. Refs are assigned only to nodes with a backend node id (a
 * real, targetable element).
 */
export function buildSnapshot(frames: readonly FrameTree[]): Snapshot {
  const refs = new Map<string, RefTarget>();
  const lines: string[] = [];
  let counter = 0;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (i > 0) lines.push(`# frame: ${frame.url}`);

    const byId = new Map<string, AxNode>();
    const childOf = new Set<string>();
    for (const node of frame.nodes) {
      byId.set(node.nodeId, node);
      for (const childId of node.childIds ?? []) childOf.add(childId);
    }
    const roots = frame.nodes.filter((node) => !childOf.has(node.nodeId));

    const walk = (node: AxNode, depth: number): void => {
      const meaningful = isMeaningful(node);
      let nextDepth = depth;
      if (meaningful) {
        let ref: string | null = null;
        if (typeof node.backendDOMNodeId === "number") {
          ref = `e${++counter}`;
          refs.set(ref, { frameKey: frame.frameKey, backendDOMNodeId: node.backendDOMNodeId });
        }
        lines.push(buildLine(ref, node, depth));
        nextDepth = depth + 1;
      }
      for (const childId of node.childIds ?? []) {
        const child = byId.get(childId);
        if (child) walk(child, nextDepth);
      }
    };
    for (const root of roots) walk(root, 0);
  }

  return { text: lines.join("\n"), refs };
}
