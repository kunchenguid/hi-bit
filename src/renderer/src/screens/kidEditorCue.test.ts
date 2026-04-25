import { describe, expect, it } from "vitest";
import { messageHasEditorCue } from "./kidEditorCue";

describe("messageHasEditorCue", () => {
  it("returns true when the message contains a fenced code block", () => {
    expect(messageHasEditorCue("Try adding this:\n\n```html\n<p>hi</p>\n```\n\nThen save.")).toBe(
      true,
    );
  });

  it("returns true when the message references a kid-known filename", () => {
    expect(messageHasEditorCue("Open index.html and look at line 8.")).toBe(true);
    expect(messageHasEditorCue("Add this to your styles.css")).toBe(true);
    expect(messageHasEditorCue("Edit the main.js file")).toBe(true);
  });

  it("returns true for natural-language file/editor cues", () => {
    expect(messageHasEditorCue("Open your page file.")).toBe(true);
    expect(messageHasEditorCue("Open the editor and try this.")).toBe(true);
    expect(messageHasEditorCue("Open your file when you're ready.")).toBe(true);
    expect(messageHasEditorCue("In your file, change the heading.")).toBe(true);
  });

  it("is case-insensitive for natural-language cues", () => {
    expect(messageHasEditorCue("OPEN YOUR PAGE FILE.")).toBe(true);
    expect(messageHasEditorCue("open Your Page File.")).toBe(true);
  });

  it("returns false for plain conversational replies with no code or file mention", () => {
    expect(messageHasEditorCue("Nice work! Keep going.")).toBe(false);
    expect(messageHasEditorCue("What would you like to add next?")).toBe(false);
    expect(messageHasEditorCue("")).toBe(false);
  });

  it("does not trigger on inline backticks alone", () => {
    expect(messageHasEditorCue("Use the `<h1>` tag for your title.")).toBe(false);
  });

  it("does not trigger on the bare word 'file' or 'editor' without an action cue", () => {
    expect(messageHasEditorCue("That's a great idea for the file system.")).toBe(false);
  });
});
