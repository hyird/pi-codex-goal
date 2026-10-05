import { test, expect } from "bun:test";
import { isContinuousGoal, isExplicitGoalPause, isExplicitGoalResume } from "../src/intent.ts";

test.each([
  "不断打磨ruvia-http 优化性能 修复bug", "请持续优化项目", "长期维护服务", "一直修复发现的问题",
  "持续优化项目直到我说停止", "Keep improving this project", "Continuously optimize the parser",
  "Please keep working on this project until I ask you to stop",
])("recognizes ongoing goal intent: %s", text => {
  expect(isContinuousGoal(text)).toBe(true);
});

test.each([
  "实现功能并验证", "修复定时器不断触发的问题", "解释持续优化是什么意思", "不要持续优化项目",
  '"不断打磨项目"', "持续优化项目直到所有测试通过", "Keep improving until all checks pass",
  "Continue improving the parser until its throughput reaches the target",
])("does not turn finite or quoted requirements into continuous work: %s", text => {
  expect(isContinuousGoal(text)).toBe(false);
});

test.each(["暂停目标", "停止当前目标", "请暂停这个目标。", "先保留成果，暂停目标", "pause goal", "Please stop the current goal."])("recognizes explicit pause intent: %s", text => {
  expect(isExplicitGoalPause(text)).toBe(true);
});

test.each(["本轮完成", "先不要停止目标", "解释暂停目标", '"暂停目标"', "暂停目标？", "暂停一下", "stop work", "pause goal if tests pass"])("does not infer pause authorization: %s", text => {
  expect(isExplicitGoalPause(text)).toBe(false);
});

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
