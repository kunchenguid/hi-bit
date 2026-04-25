// Returns true when Bit's chat message looks like a hand-off to the editor:
// either it contains a fenced code block (```...```) the kid is meant to put
// somewhere, or it references a kid-known filename or "open the file/editor".
//
// Conservative on purpose - inline backticks alone or a bare "file" mention
// don't trigger the CTA, since those are common in conversational replies.

const FENCED_CODE_BLOCK = /```[\s\S]*?```/;
const KNOWN_FILE_EXTENSIONS = /\b[\w-]+\.(?:html|css|js)\b/i;
const FILE_OR_EDITOR_CUE =
  /\b(?:open\s+(?:your|the)\s+(?:page\s+)?(?:file|editor)|in\s+your\s+file|your\s+page\s+file|your\s+editor)\b/i;

export function messageHasEditorCue(text: string): boolean {
  if (!text) return false;
  if (FENCED_CODE_BLOCK.test(text)) return true;
  if (KNOWN_FILE_EXTENSIONS.test(text)) return true;
  if (FILE_OR_EDITOR_CUE.test(text)) return true;
  return false;
}
