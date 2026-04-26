import { EditorState, type Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { createEditorExtensions } from "./CodeMirrorEditor";

function handledInput(state: EditorState, text: string): boolean {
  const selection = state.selection.main;
  const fakeView = {
    state,
    dispatch: (_transaction: Transaction) => {},
  } as EditorView;

  return state
    .facet(EditorView.inputHandler)
    .some((handler) =>
      handler(fakeView, selection.from, selection.to, text, () =>
        state.update({ changes: { from: selection.from, to: selection.to, insert: text } }),
      ),
    );
}

describe("createEditorExtensions", () => {
  it("does not auto-pair quotes", () => {
    const state = EditorState.create({ extensions: createEditorExtensions("index.js", false) });

    expect(handledInput(state, '"')).toBe(false);
  });

  it("does not auto-close HTML tags", () => {
    const state = EditorState.create({
      doc: "<div",
      selection: { anchor: 4 },
      extensions: createEditorExtensions("index.html", false),
    });

    expect(handledInput(state, ">")).toBe(false);
  });
});
