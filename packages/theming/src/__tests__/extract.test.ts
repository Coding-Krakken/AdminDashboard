import { describe, expect, it } from "vitest";
import { extractThemeFromCss, extractThemeFromUrl } from "../extract";

describe("theme extraction", () => {
  it("extracts common theme tokens from css", () => {
    const css = `
      :root {
        --color-primary: #00ffaa;
        --brand-accent: #1a73e8;
        --font-sans: Inter, sans-serif;
        --ignored-token: 10px;
      }
    `;

    const tokens = extractThemeFromCss(css);

    expect(tokens["color-primary"]).toBe("#00ffaa");
    expect(tokens["brand-accent"]).toBe("#1a73e8");
    expect(tokens["font-sans"]).toContain("Inter");
    expect(tokens["ignored-token"]).toBeUndefined();
  });

  it("extracts tokens from linked stylesheet when html has no inline vars", async () => {
    const calls: string[] = [];
    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);

      if (url === "https://acme.test") {
        return new Response(
          `<html><head><link rel=\"stylesheet\" href=\"/theme.css\"></head></html>`,
          { status: 200 }
        );
      }

      if (url === "https://acme.test/theme.css") {
        return new Response(`:root { --color-primary: #ff5500; }`, { status: 200 });
      }

      return new Response("not found", { status: 404 });
    };

    const tokens = await extractThemeFromUrl("https://acme.test", { fetcher: fakeFetch });

    expect(tokens["color-primary"]).toBe("#ff5500");
    expect(calls).toContain("https://acme.test/theme.css");
  });
});
