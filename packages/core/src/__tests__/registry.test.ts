import { describe, expect, it } from "vitest";
import { ModuleRegistry } from "../registry";

describe("module registry load planning", () => {
  it("builds deterministic load plan by dependencies then order/id", () => {
    const registry = new ModuleRegistry();

    const plan = registry.resolveLoadPlan([
      {
        id: "billing",
        title: "Billing",
        route: "/billing",
        order: 20,
        dependsOn: ["core"]
      },
      {
        id: "analytics",
        title: "Analytics",
        route: "/analytics",
        order: 30,
        dependsOn: ["billing"]
      },
      {
        id: "core",
        title: "Core",
        route: "/core",
        order: 10
      },
      {
        id: "alerts",
        title: "Alerts",
        route: "/alerts",
        order: 30,
        dependsOn: ["billing"]
      }
    ]);

    expect(plan).toEqual(["core", "billing", "alerts", "analytics"]);
  });

  it("registerMany applies the same deterministic order", () => {
    const registry = new ModuleRegistry();

    registry.registerMany([
      {
        id: "b",
        title: "B",
        route: "/b",
        dependsOn: ["a"]
      },
      {
        id: "a",
        title: "A",
        route: "/a"
      },
      {
        id: "c",
        title: "C",
        route: "/c",
        dependsOn: ["b"]
      }
    ]);

    expect(registry.list().map((module) => module.id)).toEqual(["a", "b", "c"]);
  });

  it("reports unresolved dependencies with source module details", () => {
    const registry = new ModuleRegistry();

    expect(() =>
      registry.resolveLoadPlan([
        {
          id: "operations",
          title: "Operations",
          route: "/operations",
          dependsOn: ["core"]
        }
      ])
    ).toThrow("operations -> [core]");
  });

  it("reports circular dependency sets", () => {
    const registry = new ModuleRegistry();

    expect(() =>
      registry.resolveLoadPlan([
        {
          id: "a",
          title: "A",
          route: "/a",
          dependsOn: ["b"]
        },
        {
          id: "b",
          title: "B",
          route: "/b",
          dependsOn: ["a"]
        }
      ])
    ).toThrow("Circular module dependencies detected");
  });
});
