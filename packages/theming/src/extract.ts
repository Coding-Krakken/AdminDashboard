import type { ThemeTokens } from "./index";

function normalizeKey(rawKey: string): string {
  const trimmed = rawKey.trim().replace(/^--/, "");
  return trimmed.toLowerCase();
}

function shouldIncludeToken(key: string): boolean {
  return (
    key.startsWith("brand-") ||
    key.startsWith("color-") ||
    key.startsWith("font-") ||
    key.startsWith("radius") ||
    key.startsWith("spacing-")
  );
}

function extractCssVariables(content: string): ThemeTokens {
  const tokenPattern = /--([a-zA-Z0-9-_]+)\s*:\s*([^;}{]+);/g;
  const result: ThemeTokens = {};

  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(content)) !== null) {
    const key = normalizeKey(match[1]);
    const value = match[2].trim();

    if (!shouldIncludeToken(key)) {
      continue;
    }

    if (value.length === 0) {
      continue;
    }

    result[key] = value;
  }

  return result;
}

export interface ExtractThemeOptions {
  selector?: string;
  fetcher?: typeof fetch;
}

export async function extractThemeFromUrl(
  url: string,
  options: ExtractThemeOptions = {}
): Promise<ThemeTokens> {
  const fetcher = options.fetcher ?? fetch;

  const response = await fetcher(url, {
    headers: {
      "User-Agent": "universal-admin-theme-extractor"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch theme source from ${url} (${response.status})`);
  }

  const html = await response.text();
  const htmlTokens = extractCssVariables(html);

  if (Object.keys(htmlTokens).length > 0) {
    return htmlTokens;
  }

  const cssUrls = Array.from(
    html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)
  ).map((match) => match[1]);

  const aggregated: ThemeTokens = {};

  for (const cssUrl of cssUrls) {
    const absolute = new URL(cssUrl, url).toString();
    const cssResponse = await fetcher(absolute, {
      headers: {
        "User-Agent": "universal-admin-theme-extractor"
      }
    });

    if (!cssResponse.ok) {
      continue;
    }

    const css = await cssResponse.text();
    Object.assign(aggregated, extractCssVariables(css));
  }

  return aggregated;
}

export function extractThemeFromCss(css: string): ThemeTokens {
  return extractCssVariables(css);
}
