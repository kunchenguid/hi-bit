# Bit Prompt Evidence

## End-user intent
Bit should avoid emojis by default, while a parent can opt a specific builder back in through Parent notes. Stable builder identity and Parent notes should live in the session-level context instead of being repeated in every turn message.

## Model-facing emoji instruction
`Write in plain words and do not use emojis - leave them out entirely, unless this builder's parent notes ask you to use them.`

## Session-level builder context samples
Default/no-opt-in parent notes are carried as stable session context:

`Builder: Ada, age 9. Interests: space, cats. Parent notes: Gets frustrated fast.`

Parent opt-in is carried through the same Parent notes channel after a profile edit:

`Builder: Ada, age 9. Interests: space, cats. Parent notes: Bit can use emojis.`

## Per-turn context check
Focused tests verified that per-turn user prompts contain volatile Portfolio and Currently building context plus Builder says, and do not repeat `Builder: Ada` or `Parent notes`.
