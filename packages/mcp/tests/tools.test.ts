import { describe, it, expect } from "vitest";
import { TOOL_DEFINITIONS } from "../src/tools.js";

describe("MCP tools", () => {
  it("defines 5 tools", () => {
    expect(TOOL_DEFINITIONS).toHaveLength(5);
  });

  it("kagura_search has correct schema", () => {
    const search = TOOL_DEFINITIONS.find((t) => t.name === "kagura_search");
    expect(search).toBeDefined();
    expect(search!.inputSchema.properties).toHaveProperty("query");
    expect(search!.inputSchema.required).toContain("query");
  });

  it("kagura_verify exists", () => {
    const verify = TOOL_DEFINITIONS.find((t) => t.name === "kagura_verify");
    expect(verify).toBeDefined();
  });

  it("kagura_platform has platform enum", () => {
    const platform = TOOL_DEFINITIONS.find((t) => t.name === "kagura_platform");
    expect(platform).toBeDefined();
    expect(platform!.inputSchema.properties.platform.enum).toContain("twitter");
    expect(platform!.inputSchema.properties.platform.enum).toContain("reddit");
  });

  it("all tools have descriptions", () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });
});
