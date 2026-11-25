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

### Email

Email subjects and bodies, SMS texts and API error messages are written in Mongolian (the web app shows its own localized
message per error `type`). A Mongolian SMS is encoded as UCS-2, so one message holds 70 characters instead of 160: the code
text is kept short.

`core/mail.py` follows the same pattern. `MAIL_MODE=smtp` (the `.env.example` default) delivers through SMTP with `SmtpMailer`;
`MAIL_MODE=console` only logs (the code default, so tests never open a socket). In development `make infra` starts
[Mailpit](https://mailpit.axllent.org), a local mail catcher: every email the API sends (codes, welcome, order updates) lands in
<http://localhost:8025> and never leaves the machine, so it costs nothing and needs no account. In production point
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_STARTTLS=true` and `MAIL_FROM` at a real provider;
`APP_ENV=prod` refuses `MAIL_MODE=console`.

A failed SMTP send is handled by what the email is for. A code that could not be delivered answers `503`
(`email-unavailable`) so the person knows to retry. Notification emails (welcome, order status, payment confirmation) go
through `BestEffortMailer`: they are sent after the database commit, so a mail outage is logged (`email_dropped`) instead of
turning a finished sign-up or payment into a `500`.

### Trying real SMS for free

Sending to real phones costs money, so development uses `SMS_MODE=console`. To see one real text on your own phone, a
[Twilio trial](https://www.twilio.com/docs/usage/trials) account gives free credit but only sends to phone numbers you have
verified in the Twilio console (messages start with "Sent from a Twilio Trial account"). Set `SMS_MODE=twilio` and the three
`TWILIO_*` values in your untracked `.env`, then sign in with that number. Check in the console that your country is supported.

`OTP_DEV_CODE=000000` makes every code that value. It exists for the end-to-end tests and demos, and is refused in production.

## Endpoints (`/api/v1/auth`)

Everything here is under the same-origin check and `no-store`.

| Endpoint | What it does |
| --- | --- |
| `POST /otp/request` `{destination}` | send a sign-in code to a phone number or email. Always `202` for a valid destination. `422` invalid, `429` too soon, `503` SMS or email failed |
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
* **Security activity.** `security_events` (migration `a9d3e5f7b126`) gets one row per sign-in (`login`, with the method
  `password`, `otp` or `google`), failed password attempt on an account that exists (`login_failed`; an unknown email leaves nothing),
  `new_device`, `password_changed`, `password_reset`, `sessions_revoked`, `email_changed` and `phone_changed`, written in the same
  transaction as the action so a refused action leaves no row. `GET /auth/security-events` returns your last 30, newest first, with the
  device label and the address with its last part hidden (`203.0.113.x`). The profile shows them under **Security activity**.
* **New device.** A sign-in whose User-Agent never had a login on the account before (and that is not its very first session) is a
  `new_device`: an email goes to the owner with the device and the time, after the transaction commits (`AuthService.queue_notice` /
  `deliver_notices`; a mail failure never breaks the sign-in). Phone-only accounts get the event but no message.
* **Notices.** Changing or resetting the password tells the owner's email; changing the email tells the **old** address, so someone who
  took over an account cannot move it quietly.
* **Daily limit.** On top of 5 failures per 5 minutes per email there is `RATE_LIMIT_LOGIN_EMAIL_DAILY` (20 per day): the next attempt is a
  429 even with the right password, and the owner gets one email when the limit is reached. A successful sign-in does not reset the daily
  count; changing or resetting the password does.
* **Weak passwords.** Length (10 to 128) stays the schema's rule; `core/passwords.py` also refuses, with `urn:angel:problem:weak-password`
  and a `reason` (`common`, `repeated`, `contains_identity`), a password in `core/common_passwords.txt` or a common word with a few
  characters added (`password1234`, not `password-horse-battery-staple`), one made of one or two characters, and one that contains
  the owner's name or the email's local part. There is deliberately no call to a breach service: no part of a password leaves the
  server. On a reset the check runs *before* the code is spent. The web mirrors the first two rules in `password-strength.ts` for the
  strength meter; the API decides.
* **Staff sessions.** An administrator's or warehouse worker's refresh token lives `STAFF_REFRESH_TTL_HOURS` (12) after its last use,
  and each rotation starts the window again (an idle timeout, not an absolute one).
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
