/** Remove a caller-prepended current question so APIs can append it once as the new turn. */
export function historyBeforeCurrentQuestion<T extends { role: string; text?: string; content?: string }>(
  history: T[],
  question: string,
): T[] {
  const result = [...history];
  const last = result[result.length - 1];
  const lastText = last?.text ?? last?.content;
  if (last?.role === "user" && typeof lastText === "string" && lastText.trim() === question.trim()) result.pop();
  return result;
}
