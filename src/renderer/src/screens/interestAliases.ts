const INTEREST_ALIASES: Record<string, readonly string[]> = {
  soccer: ["sports"],
  football: ["sports"],
  basketball: ["sports"],
  baseball: ["sports"],
  hockey: ["sports"],
  tennis: ["sports"],
  swimming: ["sports"],
  running: ["sports"],
  biking: ["sports"],
  cycling: ["sports"],
  ski: ["sports"],
  skiing: ["sports"],
  snowboarding: ["sports"],
  skating: ["sports"],
  skateboarding: ["sports"],
  gymnastics: ["sports"],
  karate: ["sports"],
  piano: ["music", "keyboard"],
  guitar: ["music"],
  violin: ["music"],
  cello: ["music"],
  flute: ["music"],
  trumpet: ["music"],
  ukulele: ["music"],
  singing: ["music"],
  cat: ["pets", "animals"],
  cats: ["pets", "animals"],
  dog: ["pets", "animals"],
  dogs: ["pets", "animals"],
  puppy: ["pets", "animals"],
  kitten: ["pets", "animals"],
  horse: ["animals"],
  horses: ["animals"],
  dinosaur: ["animals"],
  dinosaurs: ["animals"],
  dragon: ["animals"],
  dragons: ["animals"],
  book: ["reading", "stories"],
  books: ["reading", "stories"],
  lego: ["building"],
  legos: ["building"],
  blocks: ["building"],
  coloring: ["colors", "art"],
  crafts: ["art"],
  craft: ["art"],
};

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function expandInterests(profileInterests: readonly string[]): Set<string> {
  const expanded = new Set<string>();
  for (const raw of profileInterests) {
    const n = normalize(raw);
    if (n.length === 0) continue;
    expanded.add(n);
    const aliases = INTEREST_ALIASES[n];
    if (!aliases) continue;
    for (const alias of aliases) {
      const aliasN = normalize(alias);
      if (aliasN.length > 0) expanded.add(aliasN);
    }
  }
  return expanded;
}
