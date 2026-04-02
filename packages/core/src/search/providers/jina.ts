import type { ContentExtractor } from "../provider.js";
import { InputGuard } from "../../security/input-guard.js";

export class JinaExtractor implements ContentExtractor {
  readonly name = "jina";
  private guard = new InputGuard();

  async extract(url: string): Promise<string | null> {
    const urlCheck = this.guard.validateUrl(url);
    if (urlCheck.blocked) return null;

    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;

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
