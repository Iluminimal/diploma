import json
import time
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import jwt
import pytest

from lookalike.core.config import Settings
from lookalike.core.oauth_state import (
    code_challenge,
    new_flow,
    read_flow,
    safe_next,
    sign_flow,
    states_match,
)
from lookalike.oauth import OAuthError, OAuthProfile, build_oauth_provider
from lookalike.oauth.fake import FakeOAuth
from lookalike.oauth.google import GoogleOAuth

SECRET = "unit-test-secret-0123456789-0123456789"
CLIENT_ID = "client-123.apps.googleusercontent.com"


def google_returning(status: int = 200, **claims: Any) -> GoogleOAuth:
    """A Google client whose token endpoint answers with an ID token carrying these claims."""
    base: dict[str, Any] = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "exp": int(time.time()) + 3600,
        "nonce": "the-nonce",
        "sub": "1234567890",
        "email": "ada@example.com",
        "email_verified": True,
        "name": "Ada Lovelace",
    }
    token = jwt.encode(
        {**base, **claims}, "not-googles-key-0123456789-0123456789", algorithm="HS256"
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"id_token": token} if status == 200 else {"error": "x"})

    return GoogleOAuth(
        CLIENT_ID, "secret", "http://localhost/cb", transport=httpx.MockTransport(handler)
    )


async def exchange(provider: GoogleOAuth, nonce: str = "the-nonce") -> OAuthProfile:
    return await provider.exchange(code="c", code_verifier="v", nonce=nonce)


class TestGoogleClaims:
    async def test_a_good_token_becomes_a_profile(self) -> None:
        profile = await exchange(google_returning())

        assert (profile.subject, profile.email, profile.email_verified, profile.name) == (
            "1234567890",
            "ada@example.com",
            True,
            "Ada Lovelace",
        )

    @pytest.mark.parametrize(
        "claims",
        [
            {"iss": "https://evil.example"},
            {"aud": "someone-elses-client"},
            {"exp": int(time.time()) - 3600},
            {"nonce": "another-nonce"},
            {"sub": ""},
            {"email": None},
        ],
    )
    async def test_a_token_that_is_not_for_us_is_refused(self, claims: dict[str, Any]) -> None:
        with pytest.raises(OAuthError) as caught:
            await exchange(google_returning(**claims))

        assert caught.value.reason == "google_failed"

    async def test_the_old_issuer_spelling_and_a_list_audience_are_accepted(self) -> None:
        profile = await exchange(google_returning(iss="accounts.google.com", aud=["x", CLIENT_ID]))

        assert profile.subject == "1234567890"

    @pytest.mark.parametrize(
        ("picture", "kept"),
        [
            ("https://lh3.googleusercontent.com/a/abc=s96-c", True),
            ("http://lh3.googleusercontent.com/a/abc", False),
            ("javascript:alert(1)", False),
            ("data:image/svg+xml,<svg/>", False),
            ("https://example.com/" + "a" * 500, False),
            (None, False),
        ],
    )
    async def test_only_https_photos_are_kept(self, picture: str | None, kept: bool) -> None:
        profile = await exchange(google_returning(picture=picture))

        assert profile.picture == (picture if kept else None)

    async def test_an_unverified_email_is_reported_not_hidden(self) -> None:
        profile = await exchange(google_returning(email_verified=False))

        assert profile.email_verified is False

    async def test_google_saying_no_is_a_failure(self) -> None:
        with pytest.raises(OAuthError):
            await exchange(google_returning(status=400))

    async def test_a_response_without_an_id_token_is_a_failure(self) -> None:
        provider = GoogleOAuth(
            CLIENT_ID,
            "secret",
            "http://localhost/cb",
            transport=httpx.MockTransport(lambda request: httpx.Response(200, json={})),
        )

        with pytest.raises(OAuthError):
            await exchange(provider)

    async def test_a_network_error_is_a_failure(self) -> None:
        def boom(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("down")

        provider = GoogleOAuth(
            CLIENT_ID, "s", "http://localhost/cb", transport=httpx.MockTransport(boom)
        )

        with pytest.raises(OAuthError):
            await exchange(provider)

    def test_the_authorization_url_carries_pkce_state_and_nonce(self) -> None:
        provider = google_returning()

        url = provider.authorization_url(
            state="s1", nonce="n1", code_challenge="chal", login_hint="ada@example.com"
        )

        parsed = urlparse(url)
        query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        assert parsed.netloc == "accounts.google.com"
        assert query["client_id"] == CLIENT_ID
        assert query["redirect_uri"] == "http://localhost/cb"
        assert (query["state"], query["nonce"]) == ("s1", "n1")
        assert (query["code_challenge"], query["code_challenge_method"]) == ("chal", "S256")
        assert query["scope"] == "openid email profile"
        assert query["login_hint"] == "ada@example.com"


class TestFlowCookie:
    def test_it_round_trips(self) -> None:
        flow = new_flow("/account")

        assert read_flow(sign_flow(flow, SECRET), SECRET) == flow

    def test_flows_never_repeat(self) -> None:
        a, b = new_flow("/"), new_flow("/")

        assert (a.state, a.nonce, a.verifier) != (b.state, b.nonce, b.verifier)

    @pytest.mark.parametrize("token", [None, "", "garbage"])
    def test_junk_is_nothing(self, token: str | None) -> None:
        assert read_flow(token, SECRET) is None

    def test_a_token_signed_with_another_key_is_nothing(self) -> None:
        assert (
            read_flow(sign_flow(new_flow("/"), "another-secret-0123456789-0123456789"), SECRET)
            is None
        )

    def test_an_expired_flow_is_nothing(self) -> None:
        token = jwt.encode(
            {
                "typ": "oauth-flow",
                "st": "s",
                "no": "n",
                "cv": "v",
                "nx": "/",
                "exp": int(time.time()) - 5,
            },
            SECRET,
            algorithm="HS256",
        )

        assert read_flow(token, SECRET) is None

    def test_an_access_token_cannot_pass_for_a_flow(self) -> None:
        token = jwt.encode(
            {"typ": "access", "sub": "1", "exp": int(time.time()) + 60}, SECRET, algorithm="HS256"
        )

        assert read_flow(token, SECRET) is None

    def test_state_comparison(self) -> None:
        assert states_match("abc", "abc")
        assert not states_match("abc", "abd")
        assert not states_match("abc", None)

    def test_pkce_challenge_matches_the_rfc_example(self) -> None:
        # RFC 7636 appendix B.
        assert (
            code_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
            == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        )


class TestSafeNext:
    @pytest.mark.parametrize(
        "value", ["/", "/account/orders", "/products?q=red%20dress", "/c/men/apparel"]
    )
    def test_same_site_paths_pass(self, value: str) -> None:
        assert safe_next(value) == value

    @pytest.mark.parametrize(
        "value",
        [
            None,
            "",
            "https://evil.example",
            "//evil.example",
            "/\\evil.example",
            "javascript:alert(1)",
            "account",
            "/login",
            "/register?next=/",
            "/ok\nSet-Cookie: x=1",
            "/" + "a" * 600,
        ],
    )
    def test_everything_else_goes_home(self, value: str | None) -> None:
        assert safe_next(value) == "/"


class TestProviders:
    def test_none_without_keys_or_fake_mode(self) -> None:
        assert (
            build_oauth_provider(
                Settings(
                    app_env="test",
                    oauth_mode="google",
                    google_client_id="",
                    google_client_secret="",
                )
            )
            is None
        )

    def test_google_with_keys(self) -> None:
        provider = build_oauth_provider(
            Settings(
                app_env="test",
                oauth_mode="google",
                google_client_id="id",
                google_client_secret="secret",
            )
        )

        assert isinstance(provider, GoogleOAuth)

    def test_fake_mode(self) -> None:
        assert isinstance(
            build_oauth_provider(Settings(app_env="test", oauth_mode="fake")), FakeOAuth
        )

    def test_the_fake_is_refused_in_production(self) -> None:
        with pytest.raises(ValueError, match="OAUTH_MODE=fake"):
            Settings(
                app_env="prod",
                oauth_mode="fake",
                jwt_secret=SECRET,
                payments_mode="stripe",
                stripe_secret_key="k",
                stripe_webhook_secret="w",
            )


class TestFake:
    def encode(self, hint: str | None) -> dict[str, Any]:
        url = FakeOAuth("http://localhost/cb").authorization_url(
            state="s", nonce="n", code_challenge="c", login_hint=hint
        )
        code = parse_qs(urlparse(url).query)["code"][0]
        import base64

        return json.loads(base64.urlsafe_b64decode(code + "=" * (-len(code) % 4)))  # type: ignore[no-any-return]

    def test_the_hint_picks_the_email_and_the_subject_is_stable(self) -> None:
        first, second = self.encode("Ada@Example.com"), self.encode("ada@example.com")

        assert first["email"] == "ada@example.com"
        assert first["sub"] == second["sub"]
        assert first["sub"] != self.encode("bob@example.com")["sub"]
        assert first["verified"] is True

    def test_unverified_hint(self) -> None:
        assert self.encode("unverified:x@example.com")["verified"] is False

    async def test_a_code_that_is_not_ours_is_refused(self) -> None:
        with pytest.raises(OAuthError):
            await FakeOAuth("http://localhost/cb").exchange(
                code="nope", code_verifier="v", nonce="n"
            )
