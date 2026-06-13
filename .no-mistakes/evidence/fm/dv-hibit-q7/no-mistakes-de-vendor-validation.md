# no-mistakes de-vendor validation

Validated target change `56e9f1d718c241b155cec37cc024ef21083cd962` against base `a9036cc3667ae87add9d8823310ad5e8260b19ba`.

## Intent

Remove only the project-vendored `no-mistakes` skill while preserving user-level `no-mistakes` skill resolution.

## Evidence

```text
$ git diff --name-status a9036cc3667ae87add9d8823310ad5e8260b19ba..56e9f1d718c241b155cec37cc024ef21083cd962
D	.agents/skills/no-mistakes/SKILL.md
```

```text
$ test ! -e .agents/skills/no-mistakes/SKILL.md && test ! -e .agents/skills/no-mistakes && test ! -e .claude/skills/no-mistakes && printf 'PASS: no project-local no-mistakes skill remains\n'
PASS: no project-local no-mistakes skill remains
```

```text
$ test -f "$HOME/.agents/skills/no-mistakes/SKILL.md" && printf 'PASS: user-level no-mistakes skill exists at %s\n' "$HOME/.agents/skills/no-mistakes/SKILL.md"
PASS: user-level no-mistakes skill exists at /Users/kunchen/.agents/skills/no-mistakes/SKILL.md
```

The agent skill resolver also loaded `no-mistakes` successfully during validation and reported:

```text
Base directory for this skill: file:///Users/kunchen/.agents/skills/no-mistakes
```
