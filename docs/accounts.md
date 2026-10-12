# Accounts: phone, email, codes and devices

Who people are and how they get back in. The session mechanics (access and refresh tokens, cookies, CSRF, the guest cart merge)
are in [`commerce.md`](commerce.md); this page covers the sign-in methods and what a signed-in person can change.

## The model

An account has **a phone number, an email, or both**. Either can be added, changed or removed later, as long as one remains
(the database refuses an account with neither: `ck_users_contact_present`).

| Column | Meaning |
| --- | --- |
| `users.email` | lower-case, unique, **nullable** (an account made with a phone number has none until it adds one) |
| `users.phone` | E.164 (`+14155552671`), unique, nullable, checked by `ck_users_phone_e164`. Whatever the person types is normalised first (`core/phone.py`, the `phonenumbers` package; numbers without a country code are read in `DEFAULT_PHONE_REGION`) |
| `email_verified_at`, `phone_verified_at` | set when a code sent to it was confirmed (Google also vouches for an email). Unverified emails still sign in with a password; nothing is blocked on verification |
| `password_hash` | nullable: accounts that use codes or Google have none |

Code that needs "a name for the account" in logs, failure counters or event actors uses `User.identifier` (email, else phone).
Phone-only customers give an **email at checkout** (`contact_email` in `POST /checkout`, required only when the account has none)
because order updates are emailed; it is stored on the order, not on the account.

## One-time codes

Six digits, sent by SMS (phone) or email. They power sign-in, adding or changing a phone or email, confirming an email and
resetting a password. Table `otp_challenges`; `services/accounts/otp.py`.

* Only an HMAC of the code is stored (keyed by `JWT_SECRET`, bound to the purpose and the destination), so a database leak does
  not reveal live codes, and a code for one purpose or number is useless for another.
* Good for `OTP_TTL_SECONDS` (5 min), `OTP_MAX_ATTEMPTS` wrong guesses (5), once. Asking for a new code retires the old one.
* A new code can be asked for after `OTP_RESEND_SECONDS` (60) and at most `OTP_MAX_SENDS_PER_HOUR` (5) per destination; the route
  adds a per-address limit (`RATE_LIMIT_OTP_SEND`, `RATE_LIMIT_OTP_VERIFY`). The checks live in the **database**, not Redis, so
  they fail closed.
* A wrong guess is counted even though the request fails (the verify transaction commits before the error is raised).
* Asking for a code never reveals whether an account exists: sign-in and sign-up are one step, and "forgot password" answers
  `202` for unknown accounts too (it records the challenge, so even the cooldown looks the same, but sends nothing).

### SMS

`core/sms.py` is an interface like `Mailer` and `PaymentGateway`: `SMS_MODE=console` (default) writes the message to the API log,
so in development **read the code from the `make api` output** (`"event": "sms_sent"`); `SMS_MODE=twilio` sends it through Twilio
(`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`). `APP_ENV=prod` refuses the console sender and a fixed code.
Emails are still logged by `ConsoleMailer` until real delivery is added.

`OTP_DEV_CODE=000000` makes every code that value. It exists for the end-to-end tests and demos, and is refused in production.

## Endpoints (`/api/v1/auth`)

Everything here is under the same-origin check and `no-store`.

| Endpoint | What it does |
| --- | --- |
| `POST /otp/request` `{destination}` | send a sign-in code to a phone number or email. Always `202` for a valid destination. `422` invalid, `429` too soon, `503` SMS failed |
| `POST /otp/verify` `{destination, code}` | sign in, **creating the account on first use**; merges the guest cart; `is_new_user` tells the page to ask for a name. `400` wrong/expired, `429` too many guesses |
| `POST /password/forgot` `{destination}` | `202` always; a code goes to the account's phone or email |
| `POST /password/reset` `{destination, code, new_password}` | sets the password, ends **every** login, signs this browser in |
| `POST /email/verify/request`, `/email/verify/confirm` `{code}` | confirm the email the account already has |
| `POST /phone/request` `{phone, current_password?}`, `POST /phone/confirm` `{phone, code}` | add or replace the phone: the code goes to the **new** number, and only the person who asked can use it. `409 phone-taken` if another account has it |
| `DELETE /phone` `{current_password?}` | remove it; `409 last-sign-in-method` if there is no email |
| `POST /email/request`, `POST /email/confirm`, `DELETE /email` | the same for the email. Removing the email also removes the password (it needs the email to be used) |
| `GET /sessions` | the open logins: device ("Chrome on macOS"), address, when it began and was last used, and which is this browser |
| `DELETE /sessions/{id}` | sign one device out (`404` if it is not yours or already over); if it is this browser the cookies are cleared |
| `POST /sessions/revoke-others` | sign out everywhere except this browser |

`current_password` is required whenever the account has a password (wrong: `403`, counted against the same per-account failure
limit as login). Accounts that only use codes or Google have nothing to prove beyond being signed in.

### Rules worth knowing

* **Email codes and old passwords.** If someone signs in with an email code and the address was never verified, a password on
  that account is **removed** and its other logins end: whoever registered an unverified address first might not own it, and the
  code proves who does (the same rule as signing in with Google, see `commerce.md`).
* **Devices.** `refresh_tokens` records the User-Agent and address of the request that created each login (copied along when a
  token rotates). `describe_device` turns the header into a short label. Revoking a login revokes its whole token family.
* **Deleting an account** anonymises it as before; the typed confirmation is now the email, or the phone number if there is no email
  (`DeleteAccountRequest.confirm`), and the phone and verification times are cleared.

## The web app

* `/login`: a **Phone | Email** tab bar (a sliding thumb, CSS only). Phone: country picker and number (formatted as typed by
  `libphonenumber-js`, sent in international format) -> six boxes (`OtpInput`: paste, browser autofill via
  `autocomplete="one-time-code"`, Backspace and arrows, shake on a wrong code) -> for a new account, "What should we call you?".
  Email: the password form, with "Email me a code instead". `?method=email` opens that tab.
* `/forgot-password`: destination, then code and new password.
* `/account/profile`: **How you sign in** shows the phone number and email with their verified state and Add / Change / Verify /
  Remove dialogs (two steps: where, then the code; the password when there is one). **Your devices** lists the logins and signs
  them out.
* Checkout asks phone-only customers for an email.

Tests: `apps/api/tests/accounts/` (`test_otp_api.py`, `test_account_contact_api.py`, `test_sessions_api.py`), the component tests
beside the code, and `apps/web/e2e/phone.spec.ts` (needs the API to run with `OTP_DEV_CODE=000000`, see [`e2e.md`](e2e.md)).
