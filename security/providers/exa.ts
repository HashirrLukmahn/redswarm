/**
 * Exa threat-intelligence adapter (spec §33). Used ONLY by research agents to
 * retrieve DEFENSIVE security research and public postmortems. It is never
 * treated as proof the application is vulnerable — it is input to hypotheses.
 */

export interface ThreatResearch {
  topic: string;
  patterns: {
    name: string;
    summary: string;
    sourceUrls: string[];
    architecturalLesson: string;
  }[];
}

export interface ExaProvider {
  research(topic: string): Promise<ThreatResearch>;
}

/** Offline default so the pipeline runs without an Exa key. */
export class MockExaProvider implements ExaProvider {
  async research(topic: string): Promise<ThreatResearch> {
    return {
      topic,
      patterns: [
        {
          name: "Non-idempotent retry duplication",
          summary:
            "Retries and webhook replays cause duplicate economic effects when operations lack a durable idempotency boundary.",
          sourceUrls: ["https://owasp.org/", "https://sre.google/sre-book/"],
          architecturalLesson:
            "Deduplicate logical operations at the persistence boundary, not the transport layer.",
        },
      ],
    };
  }
}

// Defensive query guard — refuse research topics that look offensive (spec §33).
const FORBIDDEN_RESEARCH = /(exploit kit|stolen credential|dump|carding|0day for)/i;

export class ExaHttpProvider implements ExaProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async research(topic: string): Promise<ThreatResearch> {
    if (FORBIDDEN_RESEARCH.test(topic)) {
      throw new Error("Refusing offensive research query");
    }
    const res = await this.fetchImpl("https://api.exa.ai/search", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.apiKey },
      body: JSON.stringify({
        query: `defensive security research and public postmortems about ${topic}`,
        numResults: 5,
        contents: { text: { maxCharacters: 800 } },
      }),
    });
    if (!res.ok) throw new Error(`Exa HTTP ${res.status}`);
    const json = (await res.json()) as { results?: { title?: string; url?: string; text?: string }[] };
    return {
      topic,
      patterns: (json.results ?? []).map((r) => ({
        name: r.title ?? "pattern",
        summary: (r.text ?? "").slice(0, 400),
        sourceUrls: r.url ? [r.url] : [],
        architecturalLesson: "See source for defensive guidance.",
      })),
    };
  }
}
