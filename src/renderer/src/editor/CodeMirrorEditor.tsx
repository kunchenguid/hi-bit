import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import type { Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { type JSX, useEffect, useRef } from "react";
import { detectEditorLanguage, type EditorLanguage } from "./fileLanguage";

type Props = {
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
      return html();
    case "css":
      return css();
    case "javascript":
      return javascript();
    default:
      return null;
  }
}

export function CodeMirrorEditor({
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
    const langExt = languageExtensionFor(detectEditorLanguage(filename));
    const extensions: Extension[] = [
      basicSetup,
      keymap.of([
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            onSaveRef.current?.();
            return true;
          },
        },
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
      EditorView.editable.of(!readOnly),
      EditorView.contentAttributes.of(ariaLabel ? { "aria-label": ariaLabel } : {}),
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
      }),
    ];
    if (langExt) extensions.push(langExt);

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
