"""Phone numbers. They are stored and compared in E.164 ("+14155550123"): one spelling per
number, whatever the person typed."""

import phonenumbers
from phonenumbers import NumberParseException, PhoneNumberFormat


class InvalidPhoneError(ValueError):
    """The text is not a phone number that can receive an SMS."""


def normalize_phone(raw: str, default_region: str) -> str:
    """The E.164 form of `raw`. A number typed without a country code is read in
    `default_region` (an ISO 3166 code such as "US"). Raises `InvalidPhoneError`."""
    try:
        number = phonenumbers.parse(raw.strip(), default_region.upper())
    except NumberParseException as error:
        raise InvalidPhoneError("Enter a valid phone number.") from error
    if not phonenumbers.is_valid_number(number):
        raise InvalidPhoneError("Enter a valid phone number.")
    return phonenumbers.format_number(number, PhoneNumberFormat.E164)


def mask_phone(e164: str) -> str:
    """ "+14155550123" -> "+1•••••••0123": enough for the person to recognise their number, not
    enough to reuse it. Used in logs and in screens that show a number back."""
    if len(e164) <= 5:
        return "•" * len(e164)
    return f"{e164[:2]}{'•' * (len(e164) - 6)}{e164[-4:]}"
