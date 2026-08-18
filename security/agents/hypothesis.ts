import { randomUUID } from "node:crypto";
import type { AgentContext, AgentTask, HypothesisRecord, ModelInvocationMetric } from "../schemas/index.js";
import { AttackHypothesisSchema } from "../schemas/index.js";
import type { ModelProvider } from "../providers/model-provider.js";
import { BASE_HYPOTHESIS_SYSTEM, buildHypothesisPrompt } from "../prompts/base.js";
import { ROLE_DEFINITIONS } from "../prompts/roles/index.js";
import { fingerprintHypothesis } from "../services/deduplication.js";

export interface HypothesisAgentResult {
  hypothesis: HypothesisRecord;
  metric: ModelInvocationMetric;
}

function metricFrom(
  result: { timings: any; usage: any; provider: string; model: string },
  task: AgentTask,
  status: ModelInvocationMetric["status"],
  errorType?: string
): ModelInvocationMetric {
  const t = result.timings;
  return {
    invocationId: randomUUID(),
    runId: task.runId,
    agentId: task.id,
    provider: result.provider,
    model: result.model,
    queuedAt: t.queuedAt,
    startedAt: t.startedAt,
    firstTokenAt: t.firstTokenAt,
    finishedAt: t.finishedAt,
    queueLatencyMs: Math.max(0, t.startedAt - t.queuedAt),
    ttftMs: t.firstTokenAt ? t.firstTokenAt - t.startedAt : undefined,
    totalLatencyMs: t.finishedAt - t.startedAt,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    totalTokens: result.usage.totalTokens,
    retryCount: t.retryCount ?? 0,
    status,
    errorType,
  };
}

/** Run a single hypothesis agent (spec §22, §45). Structured output required. */
export async function runHypothesisAgent(
  task: AgentTask,
  context: AgentContext,
  provider: ModelProvider,
  model: string
): Promise<HypothesisAgentResult> {
  const def = ROLE_DEFINITIONS[task.role];
  const invariantId = task.objective.match(/(FI-\d+)/)?.[1] ?? "FI-001";
  const prompt = buildHypothesisPrompt(context, {
    invariantId,
    threatFamily: context.threatFamily,
    diversitySeed: task.diversitySeed,
    roleSpecialistPrompt: def?.specialistPrompt ?? "",
  });

  const result = await provider.generateStructured({
    model,
    system: BASE_HYPOTHESIS_SYSTEM,
    prompt,
    schema: AttackHypothesisSchema,
    temperature: 0.8,
    metadata: { runId: task.runId, agentId: task.id, role: task.role },
  });

  const output = result.data;
  const id = `hyp_${randomUUID().slice(0, 12)}`;
  const hypothesis: HypothesisRecord = {
    ...output,
    id,
    runId: task.runId,
    agentId: task.id,
    createdAt: Date.now(),
    fingerprint: fingerprintHypothesis(output),
    mergedFrom: [],
  };

  return { hypothesis, metric: metricFrom(result, task, "success") };
}
