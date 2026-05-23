import { describe, expect, it } from "vitest";
import { buildLayeredFlagMap } from "../flags";

describe("layered flags", () => {
  it("prioritizes user overrides over global defaults", () => {
    const result = buildLayeredFlagMap(
      ["feature-a"],
      {
        global: [{ key: "feature-a", enabled: false }],
        user: [{ key: "feature-a", enabled: true, userIds: ["u1"] }]
      },
      { userId: "u1", role: "admin" }
    );

    expect(result["feature-a"]).toBe(true);
  });

  it("falls back to false when key is unknown", () => {
    const result = buildLayeredFlagMap(["missing"], { global: [] }, {}, false);
    expect(result.missing).toBe(false);
  });
});
