import { describe, expect, it } from "vitest";
import { onboardingFragment, readOnboardingFragment } from "@/lib/auth/onboardingHandoff";
describe("AUP-010: credential handoff does not reach HTTP URL",()=>{
 it("roundtrips only in the fragment and keeps the request URL/query credential-free",()=>{
  const token=`autologin_${"a".repeat(48)}`,email="synthetic+tag@example.invalid";
  const url=new URL("https://synthetic.example.invalid/autologin"+onboardingFragment(token,email));
  expect(url.pathname+url.search).toBe("/autologin");
  expect(readOnboardingFragment(url.hash)).toEqual({token,email});
  expect(url.search).not.toContain(token);
 });
 it.each(["", "#autologin=invalid&email=test", "#autologin=undefined"])("rejects malformed handoff %s",hash=>expect(readOnboardingFragment(hash)).toBeNull());
});
