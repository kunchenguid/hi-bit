# Hi-Bit - Desktop UI Kit

Legacy visual prototype for the old Electron shell. Five surfaces, all reachable from the sidebar:

- **Home** - legacy learner dashboard with a continue card and subject grid.
- **Tutor** - legacy Bit chat view with canned teaching flows.
- **Code** - legacy code editor + live preview with Code, Page, and Split views.
- **Lessons / Trophies** - legacy stubbed simple views.

The production app now centers on a Codex provider connection, kid profile selection, and a profile-level Pi-backed Bit chat workspace where creations are managed through chat and played through live previews.

### Components

| File | What it is |
|---|---|
| `Sidebar.jsx` | Legacy app nav and gamified status chrome |
| `HomeScreen.jsx` | Dashboard: hero, continue card, subject cards grid |
| `TutorScreen.jsx` | Bit chat with suggestion chips + composer |
| `EditorScreen.jsx` | Code editor + iframe preview with Code/Page/Split view toggle |
| `XpToast.jsx` | Legacy XP pop with bounce easing |
| `styles.css` | All kit styles; reads tokens from `../../tokens/colors_and_type.css` |

### Fidelity notes

- Icons come from our custom pixel sprite sheet (`assets/icons.svg`) via `<use href>`.
- Bit is the single signature character across the app. Appears in Home hero, sidebar logo, chat avatar.
- Code editor syntax highlighting is deliberately simple; the current product edits creation files through the Pi-backed project workspace rather than an embedded editor.
- Only 3 of 5 nav destinations are fully mocked (Home, Tutor, Code). Lessons mirrors Home; Trophies is a stub.
- Codex provider connection, profile selection, profile switching, profile-level creation management, first-message idea sparks, live preview Play affordances, and the multi-creation picker are not part of this click-thru prototype.
