import type {
  GenerateStructuredParams,
  ModelProvider,
  ModelResult,
} from "./model-provider.js";
import { extractJson, ModelValidationError } from "./model-provider.js";

export interface GeminiConfig {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

/**
 * Gemini adapter — the Chief Security Architect (spec §39). Used only after
 * verified findings exist, never across the attacker swarm. Requests structured
 * (JSON) output and re-validates locally with Zod.
 */
export class GeminiProvider implements ModelProvider {
  readonly name = "gemini";
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: GeminiConfig) {
    if (!config.apiKey) throw new Error("GEMINI_API_KEY is required for GeminiProvider");
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<ModelResult<T>> {
    const queuedAt = Date.now();
    const startedAt = Date.now();
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${this.config.apiKey}`;

    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: params.system }] },
        contents: [{ role: "user", parts: [{ text: params.prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: params.temperature ?? 0.4,
        },
      }),
    });

    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text().catch(() => "")}`);

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    };
    const content = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const finishedAt = Date.now();

    const parsed = params.schema.safeParse(JSON.parse(extractJson(content)));
    if (!parsed.success) throw new ModelValidationError(parsed.error.message, content);

    return {
      data: parsed.data,
      raw: content,
      usage: {
        promptTokens: json.usageMetadata?.promptTokenCount,
        completionTokens: json.usageMetadata?.candidatesTokenCount,
        totalTokens: json.usageMetadata?.totalTokenCount,
      },
      timings: { queuedAt, startedAt, finishedAt, retryCount: 0 },
      model: params.model,
      provider: this.name,
    };
  }
}
