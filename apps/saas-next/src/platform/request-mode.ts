export function shouldReturnNotFoundForMissingTenant(mode: string | null): boolean {
  return mode === "tenant";
}
