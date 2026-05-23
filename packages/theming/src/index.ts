export type ThemeTokens = Record<string, string>;

export interface ThemeBundle {
  base: ThemeTokens;
  host?: ThemeTokens;
  tenant?: ThemeTokens;
}

export function resolveThemeTokens(bundle: ThemeBundle): ThemeTokens {
  return {
    ...bundle.base,
    ...(bundle.host ?? {}),
    ...(bundle.tenant ?? {})
  };
}

export function toCssVariables(tokens: ThemeTokens): string {
  return Object.entries(tokens)
    .map(([key, value]) => `--${key}: ${value};`)
    .join("\n");
}
