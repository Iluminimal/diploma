"""Утасны дугаар. E.164 ("+14155550123") хэлбэрээр хадгалж, харьцуулна: хүн яаж бичсэн ч нэг
дугаар нэг л хэлбэртэй байна."""

import phonenumbers
from phonenumbers import NumberParseException, PhoneNumberFormat


class InvalidPhoneError(ValueError):
    """The text is not a phone number that can receive an SMS."""


def normalize_phone(raw: str, default_region: str) -> str:
    """`raw`-ийн E.164 хэлбэр. Улсын кодгүй бичсэн дугаарыг `default_region` (ISO 3166 код,
    жишээ нь "US")-оор тайлна. Буруу бол `InvalidPhoneError` шиднэ."""
    try:
        number = phonenumbers.parse(raw.strip(), default_region.upper())
    except NumberParseException as error:
        raise InvalidPhoneError("Enter a valid phone number.") from error
    if not phonenumbers.is_valid_number(number):
        raise InvalidPhoneError("Enter a valid phone number.")
    return phonenumbers.format_number(number, PhoneNumberFormat.E164)


def mask_phone(e164: str) -> str:
    """ "+14155550123" -> "+1•••••••0123": эзэн нь дугаараа таних хангалттай, гэхдээ дахин ашиглахад
    хүрэлцэхгүй. Log болон дугаарыг буцааж харуулдаг дэлгэцэнд хэрэглэнэ."""
    if len(e164) <= 5:
        return "•" * len(e164)
    return f"{e164[:2]}{'•' * (len(e164) - 6)}{e164[-4:]}"
