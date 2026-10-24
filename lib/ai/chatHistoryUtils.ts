/** Remove a caller-prepended current question (and any pending assistant loading bubble) so APIs can append it once as the new turn. */
export function historyBeforeCurrentQuestion<T extends { role: string; text?: string; content?: string; isLoading?: boolean }>(
  history: T[],
  question: string,
): T[] {
  const result = [...history];
  while (result.length > 0) {
    const last = result[result.length - 1];
    if (last?.role === "assistant" && (last?.isLoading || !(last?.text || last?.content))) {
      result.pop();
      continue;
    }
    const lastText = last?.text ?? last?.content;
    if (last?.role === "user" && typeof lastText === "string" && lastText.trim() === question.trim()) {
      result.pop();
    }
    break;
  }
  return result;
}
