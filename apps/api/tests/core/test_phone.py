import pytest

from angel.core.phone import InvalidPhoneError, mask_phone, normalize_phone


@pytest.mark.parametrize(
    ("raw", "region", "expected"),
    [
        ("(415) 555-2671", "US", "+14155552671"),
        ("+1 415 555 2671", "MN", "+14155552671"),
        ("+976 9911 2233", "US", "+97699112233"),
        ("9911-2233", "MN", "+97699112233"),
        ("  +44 20 7946 0958 ", "us", "+442079460958"),
    ],
)
def test_numbers_are_stored_in_one_spelling(raw: str, region: str, expected: str) -> None:
    assert normalize_phone(raw, region) == expected


@pytest.mark.parametrize("raw", ["", "abc", "12", "+1 555", "415 555 26"])
def test_text_that_is_not_a_phone_number_is_rejected(raw: str) -> None:
    with pytest.raises(InvalidPhoneError):
        normalize_phone(raw, "US")


def test_a_masked_number_hides_the_middle() -> None:
    assert mask_phone("+14155552671") == "+1••••••2671"
    assert mask_phone("+1234") == "•••••"
