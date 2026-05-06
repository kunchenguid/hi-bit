import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension, StateEffect, StateField } from "@codemirror/state";
import {
  crosshairCursor,
  Decoration,
  type DecorationSet,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  WidgetType,
} from "@codemirror/view";
import { type JSX, type Ref, useEffect, useImperativeHandle, useRef } from "react";
import { detectEditorLanguage, type EditorLanguage } from "./fileLanguage";

export type CodeMirrorHandle = {
  insertText: (text: string) => void;
  showCursorMarker: (position: number, label?: string) => void;
};

export type CodeMirrorCursorMarker = {
  position: number;
  key: number;
  label?: string;
};

const DEFAULT_CURSOR_MARKER_LABEL = "← Type here";

type Props = {
  ref?: Ref<CodeMirrorHandle>;
  filename: string;
  value: string;
  onChange: (next: string) => void;
  onSave?: () => void;
  ariaLabel?: string;
  readOnly?: boolean;
  cursorMarker?: CodeMirrorCursorMarker | null;
};

function languageExtensionFor(lang: EditorLanguage | null): Extension | null {
  switch (lang) {
    case "html":
      return html({ autoCloseTags: false });
    case "css":
      return css();
    case "javascript":
      return javascript();
    default:
      return null;
  }
}

type CursorMarkerEffectValue = { position: number; label: string } | null;
const setCursorMarkerEffect = StateEffect.define<CursorMarkerEffectValue>();

class CursorMarkerWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  override eq(other: CursorMarkerWidget): boolean {
    return other.label === this.label;
  }
  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "hb-editor-cursor-marker";
    el.setAttribute("aria-hidden", "true");
    el.dataset.label = this.label;
    return el;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

const cursorMarkerField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(markers, transaction) {
    let next = transaction.docChanged ? Decoration.none : markers.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setCursorMarkerEffect)) continue;
      if (effect.value === null) {
        next = Decoration.none;
      } else {
        next = Decoration.set([
          Decoration.widget({
            widget: new CursorMarkerWidget(effect.value.label),
            side: 1,
          }).range(effect.value.position),
        ]);
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const editorBaseSetup: Extension = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  cursorMarkerField,
  keymap.of([
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
];

type EditorExtensionOptions = {
  ariaLabel?: string;
  onChange?: (next: string) => void;
  onSave?: () => void;
};

export function createEditorExtensions(
  filename: string,
  readOnly: boolean,
  options: EditorExtensionOptions = {},
): Extension[] {
  const langExt = languageExtensionFor(detectEditorLanguage(filename));
  const extensions: Extension[] = [
    editorBaseSetup,
    keymap.of([
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          options.onSave?.();
          return true;
        },
      },
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        options.onChange?.(update.state.doc.toString());
      }
    }),
    EditorView.editable.of(!readOnly),
    EditorView.contentAttributes.of(options.ariaLabel ? { "aria-label": options.ariaLabel } : {}),
    EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "13px",
      },
      ".cm-scroller": {
        fontFamily: "var(--font-mono)",
        lineHeight: "1.55",
      },
      "&.cm-focused": {
        outline: "none",
      },
      ".cm-selectionBackground, ::selection": {
        background: "color-mix(in oklch, var(--brand) 35%, transparent)",
      },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
        background: "color-mix(in oklch, var(--brand) 35%, transparent)",
      },
      ".hb-editor-cursor-marker::after": {
        content: "attr(data-label)",
      },
    }),
  ];
  if (langExt) extensions.push(langExt);
  return extensions;
}

export function CodeMirrorEditor({
  ref,
  filename,
  value,
  onChange,
  onSave,
  ariaLabel,
  readOnly = false,
  cursorMarker = null,
}: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const initialValueRef = useRef(value);

  useImperativeHandle(
    ref,
    () => ({
      insertText(text: string): void {
        const view = viewRef.current;
        if (!view) return;
        const sel = view.state.selection.main;
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: text },
          selection: { anchor: sel.from + text.length },
        });
        view.focus();
      },
      showCursorMarker(position: number, label?: string): void {
        const view = viewRef.current;
        if (!view) return;
        const safePosition = Math.max(0, Math.min(position, view.state.doc.length));
        view.dispatch({
          selection: { anchor: safePosition },
          effects: setCursorMarkerEffect.of({
            position: safePosition,
            label: label ?? DEFAULT_CURSOR_MARKER_LABEL,
          }),
          scrollIntoView: true,
        });
        view.focus();
      },
    }),
    [],
  );

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Rebuild editor when filename (language) or readOnly flag changes. The
  // seed doc comes from the ref so later `value` changes don't rebuild.
  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    const extensions = createEditorExtensions(filename, readOnly, {
      ariaLabel,
      onChange: (next) => onChangeRef.current(next),
      onSave: () => onSaveRef.current?.(),
    });

    const view = new EditorView({
      doc: initialValueRef.current,
      extensions,
      parent: host,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [filename, readOnly, ariaLabel]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
    initialValueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!cursorMarker) return;
    const view = viewRef.current;
    if (!view) return;
    const safePosition = Math.max(0, Math.min(cursorMarker.position, view.state.doc.length));
    view.dispatch({
      selection: { anchor: safePosition },
      effects: setCursorMarkerEffect.of({
        position: safePosition,
        label: cursorMarker.label ?? DEFAULT_CURSOR_MARKER_LABEL,
      }),
      scrollIntoView: true,
    });
    view.focus();
  }, [cursorMarker]);

  return <div ref={hostRef} className="hb-editor-cm" />;
}
