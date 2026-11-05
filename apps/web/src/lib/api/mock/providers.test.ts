import { describe, expect, test } from "bun:test";
import { mockApi } from "./api";

describe("mockApi.providers (demo registry)", () => {
  test("T9 demo registry lists deepseek between zai and mock", async () => {
    const providers = await mockApi.providers();
    expect(providers.map((p) => p.id)).toEqual(["zai", "deepseek", "mock"]);
    const deepseek = providers.find((p) => p.id === "deepseek");
    expect(deepseek).toEqual({
      id: "deepseek",
      label: "DeepSeek",
      model: "deepseek-flash",
      models: ["deepseek-flash", "deepseek-v4-pro"],
      configured: true,
    });
  });
});
