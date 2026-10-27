/** Fragment stays client-side; never put onboarding credentials into the HTTP URL/query. */
export function onboardingFragment(token: string, email: string): string {
  if (!/^autologin_[a-zA-Z0-9]{20,64}$/.test(token)) throw new Error("Invalid onboarding credential");
  return `#${new URLSearchParams({ autologin: token, email }).toString()}`;
}
export function readOnboardingFragment(hash: string): { token: string; email: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("autologin") || "", email = params.get("email") || "";
  return /^autologin_[a-zA-Z0-9]{20,64}$/.test(token) && email ? { token, email } : null;
}
