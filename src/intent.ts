/** Recognize explicit ongoing work, not a description of a recurring defect. */
export function isContinuousGoal(objective: string): boolean {
  const text = objective.trim();
  const ongoing = /^(?:请(?:你)?\s*)?(?:不断|持续|长期|一直)(?:地)?\s*(?:打磨|优化|改进|完善|维护|修复|执行|推进|工作)/.test(text) ||
    /^(?:please\s+)?(?:(?:continuously|continually|indefinitely)\s+(?:improve|optimi[sz]e|maintain|work)|(?:keep|continue)\s+(?:improving|optimi[sz]ing|maintaining|working))\b/i.test(text);
  if (!ongoing) return false;
  const userStop = /(?:直到|直至).*(?:我|用户).*(?:停止|结束)|\buntil\s+(?:I|the user)\s+(?:ask|tell|say|request)\b.*\b(?:stop|end)\b/i.test(text);
  return userStop || !/(?:直到|直至)|\buntil\b/i.test(text);
}

function lastClause(text: string): string {
  return text.trim().split(/[，,；;。\r\n]/).map(part => part.trim()).filter(Boolean).at(-1) ?? "";
}

/** Accept an explicit resume request, not ordinary conversation or quoted instructions. */
export function isExplicitGoalResume(text: string): boolean {
  return /^(?:(?:继续|恢复)(?:执行|实现|推进|完成)?(?:当前|这个)?(?:目标|goal)|(?:continue|resume) (?:the )?(?:current )?goal)[!！.]?$/i.test(lastClause(text));
}

/** Model-driven pause of ongoing work requires a current, explicit human request. */
export function isExplicitGoalPause(text: string): boolean {
  return /^(?:(?:请)?(?:暂停|停止)(?:执行|推进)?(?:当前|这个)?(?:目标|goal)|(?:please )?(?:pause|stop) (?:the )?(?:current )?goal)[!！.]?$/i.test(lastClause(text));
}
