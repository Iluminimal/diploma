from datetime import UTC, datetime, timedelta

import jwt

from lookalike.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    hash_token,
    needs_rehash,
    new_opaque_token,
    verify_password,
)

SECRET = "unit-test-secret-0123456789-0123456789"


def test_password_round_trip_and_salting() -> None:
    first = hash_password("hunter2-hunter2")
    second = hash_password("hunter2-hunter2")

    assert verify_password("hunter2-hunter2", first)
    assert not verify_password("hunter2-hunter3", first)
    assert first != second  # random salt
    assert first.startswith("$argon2id$")
    assert not needs_rehash(first)


def test_verify_password_rejects_garbage_hashes_instead_of_raising() -> None:
    assert not verify_password("anything", "not-a-hash")
    assert not verify_password("anything", "")


def test_access_token_round_trip() -> None:
    token = create_access_token(42, SECRET, 900)

    assert token.expires_in == 900
    assert decode_access_token(token.value, SECRET) == 42


def test_expired_token_is_rejected() -> None:
    past = datetime.now(UTC) - timedelta(hours=1)

    token = create_access_token(42, SECRET, 900, now=past)

    assert decode_access_token(token.value, SECRET) is None


def test_token_signed_with_another_key_or_tampered_is_rejected() -> None:
    token = create_access_token(42, SECRET, 900).value

    assert decode_access_token(token, "another-secret-0123456789-0123456789") is None
    head, payload, signature = token.split(".")
    assert decode_access_token(f"{head}.{payload}x.{signature}", SECRET) is None


def test_unsigned_and_wrong_type_tokens_are_rejected() -> None:
    claims = {"sub": "42", "typ": "access", "iat": 1, "exp": 4_000_000_000}
    unsigned = jwt.encode(claims, key=None, algorithm="none")
    refresh_typed = jwt.encode({**claims, "typ": "refresh"}, SECRET, algorithm="HS256")
    without_subject = jwt.encode({"exp": 4_000_000_000, "typ": "access"}, SECRET, algorithm="HS256")

    assert decode_access_token(unsigned, SECRET) is None
    assert decode_access_token(refresh_typed, SECRET) is None
    assert decode_access_token(without_subject, SECRET) is None
    assert decode_access_token("garbage", SECRET) is None


def test_opaque_tokens_are_unique_and_only_their_hash_is_comparable() -> None:
    tokens = {new_opaque_token() for _ in range(50)}

    assert len(tokens) == 50
    token = next(iter(tokens))
    assert hash_token(token) == hash_token(token)
    assert hash_token(token) != token
    assert len(hash_token(token)) == 64
