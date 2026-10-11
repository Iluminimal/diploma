const MESSAGES: Record<string, string> = {
  google_denied: "Google sign-in was cancelled. You can try again, or use your email and password.",
  google_failed: "We couldn't sign you in with Google. Please try again.",
  google_unverified: "Google hasn't verified that email address, so we can't use it to sign you in.",
  account_disabled: "This account has been disabled.",
};

/** What to tell someone sent back to the login page by `?error=`. Unknown codes say nothing: a link must not put its own words on our page. */
export function oauthErrorMessage(raw: string | string[] | undefined): string | null {
  const code = Array.isArray(raw) ? raw[0] : raw;
  // Own properties only: `?error=constructor` must not find Object.prototype's.
  return code && Object.hasOwn(MESSAGES, code) ? MESSAGES[code]! : null;
}
