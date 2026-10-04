import { test, expect } from "bun:test";
import { isExplicitGoalResume } from "../src/intent.ts";

test.each([
  "继续目标", "继续实现目标", "恢复当前目标", "继续执行当前goal!", "继续这个目标。",
  "  继续推进目标  ", "无法实现就跳过,继续实现目标", "这项不做；继续实现目标。",
  "已解决依赖\n继续目标", "resume goal", "Continue the current goal.",
])("recognizes explicit human resume intent: %s", text => {
  expect(isExplicitGoalResume(text)).toBe(true);
});

test.each([
  "普通问题", "继续", "不要继续目标", "不能恢复目标", "如果我说继续目标会怎样",
  '"继续实现目标"', "请解释“继续目标”", "继续目标？", "继续目标?", "/goal resume",
  "继续目标但先不要执行", "请输出继续实现目标这几个字",
])("does not infer resume consent: %s", text => {
  expect(isExplicitGoalResume(text)).toBe(false);
});
