const MESSAGES: Record<string, string> = {
  google_denied: "Google sign-in was cancelled. You can try again, or use your email and password.",
  google_failed: "We couldn't sign you in with Google. Please try again.",
  google_unverified: "Google hasn't verified that email address, so we can't use it to sign you in.",
  account_disabled: "This account has been disabled.",
};

/**
 * `?error=`-оор нэвтрэх хуудас руу буцаагдсан хүнд юу хэлэх. Үл мэдэгдэх код юу ч хэлэхгүй: холбоос
 * бидний хуудсанд өөрийн үгээ оруулж болохгүй.
 */
export function oauthErrorMessage(raw: string | string[] | undefined): string | null {
  const code = Array.isArray(raw) ? raw[0] : raw;
  // Зөвхөн өөрийн property: `?error=constructor` нь Object.prototype-ийнхыг олох ёсгүй.
  return code && Object.hasOwn(MESSAGES, code) ? MESSAGES[code]! : null;
}
