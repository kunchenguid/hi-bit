# Knowledge Graph v1

The authored DAG of knowledge points (KPs) that Bit teaches through. This is the core IP of Hi-Bit and the scheduler's source of truth. This file is the scope doc for v1: what the graph covers, how entries are shaped, and the full list of nodes.

The runtime representation is structured data (YAML or JSON under `graph/`, one file per node). This doc is the human-readable spec authors read before touching nodes.

## Authoring principles

- **Hand-authored.** No LLM-generated curriculum. Every node is reviewed.
- **Small and sharp.** A KP is one concept that can be mastered in a single focused moment. "CSS" is not a KP. "Changing the background color of a div" is a KP.
- **Language-blended.** Nodes cover HTML, CSS, and JS, but the kid never sees those labels. The graph is one web.
- **Prereqs are tight.** Only list prereqs without which the KP is genuinely incomprehensible. Over-specifying prereqs turns the graph into a single-file queue.
- **No exercises on the node.** The node says what must be mastered; Bit invents how to teach it each time.

## Schema

Every KP node has the following fields.

| Field | Type | Description |
|---|---|---|
| `id` | string | Stable kebab-case identifier. Never renamed once shipped. |
| `title_parent` | string | Technical label for the parent view and graph authoring. |
| `title_kid` | string | Warm label used when Bit narrates progress to the kid. |
| `area` | enum | `html`, `css`, `js`, `dom`, `canvas`, `interactivity`. Used only for internal tagging and parent views. |
| `prereqs` | [id] | KP ids required before this one is introduced. |
| `introduces` | [concept_tag] | Short concept tags this node teaches, for cross-reference. |
| `mastery_signals` | list | Observable conditions under which Bit marks this KP mastered. |

### Mastery model

Each KP moves through four levels per kid. The progress file tracks the current level.

- `saw_it`: Bit introduced the concept in context. Default after first use.
- `did_with_help`: Kid used the concept while Bit guided.
- `did_unprompted`: Kid used the concept without Bit suggesting it, in a step where it was an option.
- `explained_it`: Kid explained the concept back in their own words.

Mastery signals on each KP describe what counts as the transition into each level for that specific concept. Example: `did_unprompted` for `events-click` is "kid attaches a click handler to an element they created in the current session, without Bit proposing the listener."

A fixed-project dream is "doable" when all its required KPs are at `did_with_help` or above for the current kid.

### Dream files

Dream files default to `mode: project`.
Project dreams author direct `requires:` and must list at least one shipped KP.
Freeform dreams use `mode: freeform`, may leave `requires: []`, and skip a fixed dream path; Hi-Bit may still suggest ready KPs as a learning focus.
When a kid starts or restarts any dream, including `playground`, Hi-Bit scaffolds `projects/<dream_id>/index.html` from `src/main/storage/projects.ts`.
Selected dream ids have custom starter pages, and the rest use a generic fallback page, so starter content should stay aligned with the dream's promise and required KPs.

### Dream difficulty

Project dream files author direct `requires:` only, then validation computes the runtime 1-5 bit difficulty rating from the graph.
The score is the higher of two measures: maximum direct required-KP depth and the count of direct required KPs.
Transitive prereqs still matter for readiness and scheduling, but they are not counted as visible dream difficulty.
Depth scores map to 1 bit for depths 1-5, 2 bits for depths 6-8, 3 bits for depths 9-12, 4 bits for depths 13-18, and 5 bits for deeper chains.
Direct required-KP count scores map to 1 bit for 1 KP, 2 bits for 2 KPs, 3 bits for 3-4 KPs, 4 bits for 5-7 KPs, and 5 bits for 8 or more KPs.
A freeform dream with an empty `requires:` list validates as 1 bit.

## v1 scope

Coverage target: everything needed to build every fixed-project dream on the shipped v1 dream menu.
The current library has 53 dreams, including the `playground` freeform dream plus snake, pong, pet page, birthday card, quiz, drawing app, clicker, typing game, story page, and relatives.

Out of scope for v1:

- Modules, bundlers, build tools.
- Fetch, APIs, network requests.
- Classes and prototypes.
- Async / promises / await.
- Regex.
- Touch events (we assume desktop keyboard and mouse).
- TypeScript.
- Accessibility as a distinct area (baked into HTML nodes where relevant, not its own branch).
- CSS preprocessors, frameworks.

## The graph

Groupings below are authoring conveniences, not kid-facing categories. A kid never sees "HTML nodes."

### Foundations

| id | title_parent | title_kid | prereqs |
|---|---|---|---|
| `run-and-preview` | Using See my page and the live preview | running your code and seeing what happens | _none_ |
| `web-page-parts` | HTML, CSS, and JavaScript roles | the three parts of a web page | `run-and-preview` |
| `html-tags-basics` | HTML tag basics | the little markers around page stuff | `web-page-parts` |
| `html-page-body` | Body as the visible page area | where visible page stuff goes | `html-tags-basics` |
| `html-head-title` | Head and title basics | page info that is not the page itself | `html-page-body` |
| `html-attributes-basics` | HTML attribute basics | extra details inside a tag | `html-page-body` |

### HTML

| id | title_parent | title_kid | prereqs |
|---|---|---|---|
| `html-doc-shell` | HTML document shell | the frame that holds your page | `html-head-title` |
| `html-text-headings` | Headings `h1`-`h6` | big titles and small titles | `html-page-body` |
| `html-text-paragraphs` | Paragraphs | regular text | `html-page-body` |
| `html-lists` | Ordered and unordered lists | lists of things | `html-text-paragraphs` |
| `html-links` | Anchor tags | clickable links to other pages | `html-text-paragraphs`, `html-attributes-basics` |
| `html-images` | Image tags with `src` and `alt` | pictures | `html-attributes-basics` |
| `html-div-span` | Generic containers | invisible boxes that hold other things | `html-text-paragraphs` |
| `html-buttons` | Button elements | clickable buttons | `html-page-body` |
| `html-inputs-text` | Text input | a place where the kid types | `html-attributes-basics` |
| `html-inputs-number` | Number input | a place where the kid types a number | `html-inputs-text` |
| `html-inputs-checkbox-radio` | Checkbox and radio inputs | boxes you can check | `html-inputs-text` |
| `html-labels` | Form labels | telling inputs what they are | `html-inputs-text`, `html-id-attribute` |
| `html-id-attribute` | `id` attribute | one special name for one thing | `html-attributes-basics` |
| `html-id-class` | `id` and `class` attributes | names and categories for your elements | `html-div-span`, `html-id-attribute` |
| `html-comments` | HTML comments | notes that don't show up on the page | `html-page-body` |

### CSS

| id | title_parent | title_kid | prereqs |
|---|---|---|---|
| `css-attach` | Attaching CSS (style tag and external sheet) | where styles live | `web-page-parts` |
| `css-rule-basics` | CSS rule basics | one style rule | `css-attach` |
| `css-selectors-element` | Element selectors | styling every `<p>` on the page | `css-rule-basics`, `html-text-paragraphs` |
| `css-selectors-class-id` | Class and id selectors | styling just one thing or one group | `css-selectors-element`, `html-id-class` |
| `css-colors` | Colors (named and hex) | picking colors | `css-selectors-element` |
| `css-text-font` | `font-family`, `font-size`, `font-weight` | how your text looks | `css-selectors-element` |
| `css-background` | `background-color` and `background-image` | backgrounds | `css-colors` |
| `css-box-model` | Padding, margin, border | space around and inside things | `css-selectors-class-id` |
| `css-border-radius` | Rounded corners | making boxes not so square | `css-box-model` |
| `css-width-height` | Sizing elements | making things bigger or smaller | `css-box-model` |
| `css-display-block-inline` | Block vs inline display | why some things stack and some don't | `css-box-model` |
| `css-flex-basics` | Flexbox (row, gap, justify, align) | lining things up | `css-display-block-inline` |
| `css-grid-basics` | Grid (columns, rows, gap) | laying things out in a grid | `css-flex-basics` |
| `css-position-absolute` | `position: absolute` with `top`/`left` | putting something exactly where you want | `css-width-height` |
| `css-hover` | `:hover` pseudo-class | making things react when you point at them | `css-colors` |
| `css-transitions` | `transition` property | smooth changes instead of sudden ones | `css-hover` |
| `css-transforms` | `transform: translate/rotate/scale` | moving, turning, and sizing things | `css-transitions` |
| `css-opacity` | `opacity` | making things see-through | `css-colors` |

### JavaScript core

| id | title_parent | title_kid | prereqs |
|---|---|---|---|
| `js-attach` | Attaching JS (script tag) | where code lives | `web-page-parts` |
| `js-instructions-basics` | JavaScript instructions | code steps the computer follows | `js-attach` |
| `js-function-call-basics` | Calling a function | telling code to do a named action | `js-instructions-basics` |
| `js-console-log` | `console.log` and the dev console | how to print something so only you see it | `js-instructions-basics` |
| `js-variables-let-const` | `let` and `const` | giving things names so you can use them later | `js-console-log` |
| `js-strings` | Strings and concatenation | writing text in code | `js-variables-let-const` |
| `js-numbers` | Numbers and arithmetic | math in code | `js-variables-let-const` |
| `js-booleans` | `true` and `false` | yes and no in code | `js-variables-let-const` |
| `js-template-literals` | Backtick template strings | sticking values into text | `js-strings` |
| `js-arrays` | Arrays and index access | lists of things you can look up | `js-variables-let-const` |
| `js-array-push` | `Array.prototype.push` | adding to a list | `js-arrays` |
| `js-array-length` | `.length` on arrays | how long your list is | `js-arrays` |
| `js-objects` | Object literals and property access | labeled collections of stuff | `js-variables-let-const` |
| `js-comparison` | `===`, `!==`, `<`, `>` | comparing two things | `js-numbers` |
| `js-if-else` | `if` / `else if` / `else` | doing different things depending on what's true | `js-booleans`, `js-comparison` |
| `js-logic` | `&&`, `\|\|`, `!` | combining yes and no | `js-if-else` |
| `js-for-loop` | `for` loop | doing something a bunch of times | `js-if-else`, `js-array-length` |
| `js-for-of` | `for...of` over arrays | going through every item in a list | `js-for-loop`, `js-arrays` |
| `js-while-loop` | `while` loop | doing something until you say stop | `js-for-loop` |
| `js-functions-define` | Function declarations | teaching the computer a new trick | `events-click` |
| `js-function-params` | Parameters and arguments | giving your trick different inputs | `js-functions-define` |
| `js-function-return` | `return` | getting an answer back from a function | `js-function-params` |
| `js-math-random` | `Math.random` and `Math.floor` | picking a random number | `js-numbers` |
| `js-comments` | Line and block comments | writing notes next to your code | `js-attach` |

### DOM

| id | title_parent | title_kid | prereqs |
|---|---|---|---|
| `dom-page-tree-basics` | Page tree basics | the page as a tree of things | `html-tags-basics` |
| `dom-query-selector` | `document.querySelector` and `getElementById` | grabbing something on the page | `dom-page-tree-basics`, `js-variables-let-const`, `html-id-attribute` |
| `dom-text-content` | `textContent` | changing the words inside an element | `dom-query-selector` |
| `dom-change-style` | `element.style.property` | changing how something looks from code | `dom-query-selector`, `css-colors` |
| `dom-class-toggle` | `classList.add` / `remove` / `toggle` | turning a style on and off | `dom-change-style`, `css-selectors-class-id` |
| `dom-set-attribute` | `setAttribute` and direct property writes | changing image sources, links, etc. | `dom-query-selector`, `html-images` |
| `dom-create-append` | `createElement`, `appendChild` | making a brand new thing and adding it to the page | `dom-query-selector` |
| `dom-input-value` | Reading `.value` from an input | getting what the kid typed | `dom-query-selector`, `html-inputs-text` |

### Events

| id | title_parent | title_kid | prereqs |
|---|---|---|---|
| `event-callback-basics` | Event callback basics | code saved for later | `js-function-call-basics` |
| `events-click` | `addEventListener('click', ...)` | making things happen when you click | `dom-query-selector`, `event-callback-basics`, `html-buttons` |
| `events-keydown` | `addEventListener('keydown', ...)` | making things happen when you press a key | `events-click` |
| `events-input` | `input` event on text fields | reacting as the kid types | `events-click`, `dom-input-value` |
| `events-change` | `change` event on form controls | reacting when something is chosen | `events-click`, `html-inputs-checkbox-radio` |

### Interactivity patterns

| id | title_parent | title_kid | prereqs |
|---|---|---|---|
| `state-counter` | Counter state in a variable | keeping track of a number that changes | `dom-text-content`, `events-click` |
| `state-toggle` | Boolean state flip | keeping track of an on/off thing | `dom-class-toggle`, `events-click` |
| `state-array-in-dom` | Rendering an array to the DOM | showing a list on the page | `js-for-of`, `dom-create-append` |
| `timers-setinterval` | `setInterval` and `clearInterval` | doing something over and over on a timer | `events-click`, `js-functions-define` |
| `timers-settimeout` | `setTimeout` | doing something later | `events-click`, `js-functions-define` |
| `animation-raf` | `requestAnimationFrame` loop | drawing a new frame as fast as the screen updates | `timers-setinterval` |
| `storage-localstorage` | `localStorage.setItem` / `getItem` | saving something so it's still there after you close the page | `js-variables-let-const`, `js-strings` |

### Canvas and graphics

| id | title_parent | title_kid | prereqs |
|---|---|---|---|
| `canvas-setup` | `<canvas>` element and 2D context | making a drawing surface | `html-doc-shell`, `js-attach` |
| `canvas-fillrect` | `fillRect` and `fillStyle` | drawing a rectangle | `canvas-setup`, `css-colors` |
| `canvas-clear` | `clearRect` | wiping the canvas | `canvas-fillrect` |
| `canvas-circle` | `beginPath` / `arc` / `fill` | drawing a circle | `canvas-fillrect` |
| `canvas-text` | `fillText` and font setting | drawing words on the canvas | `canvas-fillrect` |
| `canvas-keyboard-move` | Updating position from keys and redrawing | moving a shape with the arrow keys | `canvas-clear`, `events-keydown`, `state-counter` |
| `canvas-collision-bounds` | Checking if a shape hit the edge | stopping at the walls | `canvas-keyboard-move`, `js-if-else` |
| `canvas-collision-rect` | Rect-vs-rect collision | two shapes running into each other | `canvas-collision-bounds` |

### Project-level mechanics

These are composite KPs that only make sense once several of the above are in hand. Treated as KPs so Bit can explicitly narrate them to the kid and the parent.

| id | title_parent | title_kid | prereqs |
|---|---|---|---|
| `project-game-loop` | Update-then-render loop | the heartbeat of a game | `animation-raf`, `canvas-clear`, `state-counter` |
| `project-score` | Tracking and displaying a score | keeping score | `state-counter`, `dom-text-content` |
| `project-reset` | Reset to initial state | starting over without reloading | `state-counter`, `events-click` |

## Example complete nodes

Showing the full field set for three representative nodes. Authoring should follow this shape in the runtime files.

### `events-click`

```yaml
id: events-click
title_parent: addEventListener('click', ...)
title_kid: making things happen when you click
area: dom
prereqs: [dom-query-selector, event-callback-basics, html-buttons]
introduces: [event-handler, callback-function, dom-event]
mastery_signals:
  saw_it: Bit wrote a click handler in the kid's code and explained what the parts mean.
  did_with_help: Kid wrote the handler under Bit's step-by-step guidance.
  did_unprompted: Kid attached a click handler to an element they created in the current session, without Bit proposing the listener.
  explained_it: Kid correctly answered what happens when the button is clicked, identifying the handler function as the thing that runs.
```

### `js-for-of`

```yaml
id: js-for-of
title_parent: for...of over arrays
title_kid: going through every item in a list
area: js
prereqs: [js-for-loop, js-arrays]
introduces: [iteration, loop-variable]
mastery_signals:
  saw_it: Bit demonstrated a for...of loop in the kid's code and called out the loop variable.
  did_with_help: Kid wrote a for...of loop with Bit filling the body.
  did_unprompted: Kid reached for a for...of loop when processing a list, without Bit suggesting a loop.
  explained_it: Kid explained that the loop runs the body once per item and that the loop variable is the current item.
```

### `project-game-loop`

```yaml
id: project-game-loop
title_parent: Update-then-render loop
title_kid: the heartbeat of a game
area: canvas
prereqs: [animation-raf, canvas-clear, state-counter]
introduces: [tick, update-phase, render-phase, frame]
mastery_signals:
  saw_it: Bit structured the kid's first animated canvas project into update and render calls and named the phases.
  did_with_help: Kid added a new thing to update and a new thing to render with Bit's guidance.
  did_unprompted: Kid added a new piece of game state and remembered to both update it and render it, without Bit pointing out the two phases.
  explained_it: Kid described the loop as "first figure out where everything is, then draw it," or equivalent in their words.
```

## Graph storage layout

The repo ships the canonical graph and dream library here:

```
graph/
  nodes/
    events-click.yml
    js-for-of.yml
    ...
  dreams/
    beat-pad.yml
    snake.yml
    ...
```

One file per node or dream. On startup, `src/main/storage/graphSeed.ts` mirrors shipped YAML into the user's `graph/nodes/` and `graph/dreams/` dirs under Electron `userData`: changed bundled files are overwritten, and YAML files absent from the bundled source are removed when that source dir exists. CI validates ids are unique, prereqs resolve, dreams reference shipped KPs, and the graph is acyclic.

## Open authoring questions

- Do we split `html-inputs-*` into more granular KPs (e.g. placeholder, required) or keep them grouped?
- Is `animation-raf` too big a leap from `timers-setinterval`, or should `timers-setinterval` be enough for v1 games?
- Should `storage-localstorage` be two KPs (write, read) or one?
- Do we add a `project-high-score` node, or is that implied by combining `project-score` and `storage-localstorage`?
- Do we want an explicit `debug-reading-errors` KP for reading console error messages, or is that part of `js-console-log`?
