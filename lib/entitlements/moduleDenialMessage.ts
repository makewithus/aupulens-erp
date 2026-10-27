export function moduleDenialMessage(moduleName: string, tier: string, reason?: string | null): string {
  if (reason === "disabled_by_admin") {
    return `The ${moduleName} module is disabled by your organization. Ask an administrator to enable it in settings.`;
  }
  const plan = tier === "your current plan" ? tier : `your ${tier} plan`;
  return `The ${moduleName} module is not available on ${plan}.`;
}
