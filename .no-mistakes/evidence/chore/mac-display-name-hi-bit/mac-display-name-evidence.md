# macOS Display Name Evidence

Validated against a production macOS package built from `electron-builder.yml`.

## Production Bundle Metadata

Command outputs from `dist/mac-universal/Hi-Bit.app/Contents/Info.plist`:

```text
CFBundleDisplayName: Hi Bit
CFBundleName: Hi-Bit
CFBundleIdentifier: com.hibit.app
```

This demonstrates that Finder, Dock, and the menu bar receive the user-visible display name `Hi Bit`, while the existing bundle name and identifier stay unchanged for existing app data and installed app identity.

## Production Download Artifact

The production macOS zip target generated this file:

```text
dist/Hi-Bit-0.0.3-mac-arm64.zip
```

This demonstrates that release download filenames remain hyphenated.
