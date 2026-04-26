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
import { EditorState, type Extension } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { type JSX, type Ref, useEffect, useImperativeHandle, useRef } from "react";
import { detectEditorLanguage, type EditorLanguage } from "./fileLanguage";

export type CodeMirrorHandle = {
  insertText: (text: string) => void;
};

type Props = {
  ref?: Ref<CodeMirrorHandle>;
  filename: string;
  value: string;
  onChange: (next: string) => void;
  onSave?: () => void;
  ariaLabel?: string;
  readOnly?: boolean;
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

  return <div ref={hostRef} className="hb-editor-cm" />;
}
