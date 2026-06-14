export function combineIdeaWithClarification(originalIdea: string, addedContext: string) {
  return `${originalIdea.trim()}\n\nAdditional context:\n${addedContext.trim()}`;
}
