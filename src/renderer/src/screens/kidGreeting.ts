function ensureTerminal(text: string): string {
  if (/[.!?]$/.test(text)) return text;
  return `${text}.`;
}

export type KidGreetingInput = {
  profileName: string;
  dreamTitleKid: string | null;
  dreamMode?: "project" | "conversation";
  nextUpText: string | null;
};

export function buildKidGreetingText(input: KidGreetingInput): string {
  const name = input.profileName.trim();
  const greeting = name.length > 0 ? `Hey ${name}!` : "Hey!";
  if (input.dreamMode === "conversation") {
    return `${greeting} What would you like to do?`;
  }
  const dream = input.dreamTitleKid?.trim();
  const ready = dream && dream.length > 0 ? ` Ready for ${dream}?` : "";
  const next = input.nextUpText?.trim();
  const startWith =
    next && next !== "ready to build!" ? ` We'll start with ${ensureTerminal(next)}` : "";
  return `${greeting}${ready}${startWith} Type "ready" when you want to go.`;
}
