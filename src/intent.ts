/** Accept an explicit resume request, not ordinary conversation or quoted instructions. */
export function isExplicitGoalResume(text: string): boolean {
  const clause = text.trim().split(/[，,；;。\r\n]/).map(part => part.trim()).filter(Boolean).at(-1) ?? "";
  return /^(?:(?:继续|恢复)(?:执行|实现|推进|完成)?(?:当前|这个)?(?:目标|goal)|(?:continue|resume) (?:the )?(?:current )?goal)[!！.]?$/i.test(clause);
}
