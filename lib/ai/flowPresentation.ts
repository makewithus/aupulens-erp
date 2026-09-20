/** Turns the guided flow's structured reply into one-tap replies for the chat (like Claude Code's ask-in-chat options). */
export interface QuickReply { label: string; value: string; kind: "choice" | "action" }

export function buildQuickReplies(o: { choices?: string[]; actions?: { label: string; value: string }[] }): QuickReply[] {
  // A choice is sent as its own LABEL (the flow resolves choices by label), an action as its natural word ("back", "yes", "cancel"…).
  return [
    ...(o.choices ?? []).map((c) => ({ label: c, value: c, kind: "choice" as const })),
    ...(o.actions ?? []).map((a) => ({ label: a.label, value: a.value, kind: "action" as const })),
  ];
}

/** When buttons are shown, drop the typed-answer scaffolding ("1. **Acme**", "Reply with a number…", "You can say …") from the text. */
export function stripChoiceText(message: string): string {
  return message
    .split("\n")
    .filter((l) => !/^\s*\d+\.\s+\*\*.*\*\*\s*$/.test(l) && !/^\s*Reply with a number/i.test(l) && !/^\s*You can say "/i.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/([^\n])\n(?=[^\n]{1})(?![-*] )/g, "$1  \n"); // markdown hard breaks: a single newline would otherwise run the lines together
}
