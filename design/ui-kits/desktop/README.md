# Hi-Bit — Desktop UI Kit

The Electron app recreated as an interactive in-browser prototype. Five surfaces, all reachable from the sidebar:

- **Home** — Boo greets the learner, a "continue" card resumes the current lesson, a rainbow grid picks a subject.
- **Tutor** — Boo chat view. Try typing `let` to see a correct-answer flow; `var` or `const` for gentle redirection; anything else for a nudge. XP is awarded on success.
- **Code** — code editor + live preview with Code, Page, and Split views. "See my page" runs HTML/CSS/JS in an iframe; preview can be refreshed after edits.
- **Lessons / Trophies** — stubbed simple views (real product would expand).

### Components

| File | What it is |
|---|---|
| `Sidebar.jsx` | App nav, level chip, XP bar, streak pill |
| `HomeScreen.jsx` | Dashboard: hero, continue card, subject cards grid |
| `TutorScreen.jsx` | Boo chat with suggestion chips + composer |
| `EditorScreen.jsx` | Code editor + iframe preview with Code/Page/Split view toggle |
| `XpToast.jsx` | "+N XP" pop with bounce easing |
| `styles.css` | All kit styles; reads tokens from `../../colors_and_type.css` |

### Fidelity notes

- Icons come from our custom pixel sprite sheet (`assets/icons.svg`) via `<use href>`.
- Boo (mascot) is the single signature character across the app. Appears in Home hero, sidebar logo, chat avatar.
- Code editor syntax highlighting is deliberately simple — real product would use CodeMirror / Monaco.
- Only 3 of 5 nav destinations are fully mocked (Home, Tutor, Code). Lessons mirrors Home; Trophies is a stub.
