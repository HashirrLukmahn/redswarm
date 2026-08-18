import type { ZodType, ZodTypeDef } from "zod";

export interface InvocationMetadata {
  runId: string;
  agentId: string;
  role?: string;
}

export interface ModelUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ModelTimings {
  queuedAt: number;
  startedAt: number;
  firstTokenAt?: number;
  finishedAt: number;
  retryCount: number;
}

export interface ModelResult<T> {
  data: T;
  raw: string;
  usage: ModelUsage;
  timings: ModelTimings;
  model: string;
  provider: string;
}

export interface GenerateStructuredParams<T> {
  model: string;
  system: string;
  prompt: string;
  schema: ZodType<T, ZodTypeDef, any>;
  temperature?: number;
  metadata: InvocationMetadata;
}

/**
 * Provider abstraction (spec §7). Agent logic depends only on ModelProvider,
 * never on GMI/Gemini directly.
 */
export interface ModelProvider {
  readonly name: string;
  generateStructured<T>(params: GenerateStructuredParams<T>): Promise<ModelResult<T>>;
}

export class ModelValidationError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message);
    this.name = "ModelValidationError";
  }
}

export class RateLimitError extends Error {
  constructor(public readonly retryAfterMs?: number) {
    super("rate_limited");
    this.name = "RateLimitError";
  }
}

/** Extract the first balanced JSON object from a model response. */
export function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  if (start === -1) return candidate;
  let depth = 0;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }
  return candidate.slice(start);
}
