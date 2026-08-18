import type {
  GenerateStructuredParams,
  ModelProvider,
  ModelResult,
} from "./model-provider.js";
import { extractJson, ModelValidationError, RateLimitError } from "./model-provider.js";

export interface GMIConfig {
  apiKey: string;
  baseUrl: string;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

interface OpenAIChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/**
 * GMI Cloud adapter (spec §8). OpenAI-compatible POST /v1/chat/completions with
 * JSON mode, exponential backoff + jitter on 429, and per-call metrics. Model
 * JSON is always re-validated locally with Zod — never trusted blindly.
 */
export class GMIProvider implements ModelProvider {
  readonly name = "gmi";
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;

  constructor(private readonly config: GMIConfig) {
    if (!config.apiKey) throw new Error("GMI_API_KEY is required for GMIProvider");
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.maxRetries = config.maxRetries ?? 5;
  }

  private backoffMs(attempt: number, retryAfter?: number): number {
    if (retryAfter) return retryAfter;
    const base = Math.min(1000 * 2 ** attempt, 20_000);
    const jitter = Math.random() * base * 0.5; // full-ish jitter to avoid thundering herd
    return base / 2 + jitter;
  }

  async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<ModelResult<T>> {
    const queuedAt = Date.now();
    const url = `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`;
    let retryCount = 0;
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const startedAt = Date.now();
      try {
        const res = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: params.model,
            messages: [
              { role: "system", content: params.system },
              { role: "user", content: params.prompt },
            ],
            temperature: params.temperature ?? 0.7,
            response_format: { type: "json_object" },
          }),
        });

        if (res.status === 429) {
          const retryAfter = Number(res.headers.get("retry-after")) * 1000 || undefined;
          retryCount++;
          if (attempt === this.maxRetries) throw new RateLimitError(retryAfter);
          await new Promise((r) => setTimeout(r, this.backoffMs(attempt, retryAfter)));
          continue;
        }

        if (!res.ok) {
          throw new Error(`GMI HTTP ${res.status}: ${await res.text().catch(() => "")}`);
        }

        const json = (await res.json()) as OpenAIChatResponse;
        const content = json.choices?.[0]?.message?.content ?? "";
        const finishedAt = Date.now();

        const parsed = params.schema.safeParse(JSON.parse(extractJson(content)));
        if (!parsed.success) {
          throw new ModelValidationError(parsed.error.message, content);
        }

        return {
          data: parsed.data,
          raw: content,
          usage: {
            promptTokens: json.usage?.prompt_tokens,
            completionTokens: json.usage?.completion_tokens,
            totalTokens: json.usage?.total_tokens,
          },
          timings: { queuedAt, startedAt, finishedAt, retryCount },
          model: params.model,
          provider: this.name,
        };
      } catch (err) {
        lastError = err;
        // ModelValidationError: retry once more (the model may fix its JSON).
        if (err instanceof ModelValidationError && attempt < this.maxRetries) {
          retryCount++;
          await new Promise((r) => setTimeout(r, this.backoffMs(attempt)));
          continue;
        }
        if (err instanceof RateLimitError) throw err;
        if (attempt >= this.maxRetries) break;
        retryCount++;
        await new Promise((r) => setTimeout(r, this.backoffMs(attempt)));
      }
    }
    throw lastError ?? new Error("GMI request failed");
  }
}
