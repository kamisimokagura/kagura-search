import type { ContentExtractor } from "../provider.js";

export class JinaExtractor implements ContentExtractor {
  readonly name = "jina";

  async extract(url: string): Promise<string | null> {
    const jinaUrl = `https://r.jina.ai/${url}`;

    try {
      const response = await fetch(jinaUrl, {
        headers: {
          Accept: "text/plain",
          "X-Return-Format": "markdown",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;

      return await response.text();
    } catch {
      return null;
    }
  }
}
