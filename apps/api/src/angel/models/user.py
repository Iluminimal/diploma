import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from angel.db.base import Base
from angel.models.mixins import TimestampMixin

ROLE_CUSTOMER = "customer"
ROLE_ADMIN = "admin"


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        # Emails are stored lower-cased; the constraint makes a missed normalisation a loud error
        # instead of two accounts that differ only by case.
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        # Phones are stored in E.164 (`+` and 8 to 15 digits, no leading zero): one spelling per
        # number, so the unique index really means "one account per phone".
        CheckConstraint(r"phone ~ '^\+[1-9][0-9]{7,14}$'", name="phone_e164"),
        # Phone or email, either can be removed later, but never both.
        CheckConstraint("email IS NOT NULL OR phone IS NOT NULL", name="contact_present"),
        CheckConstraint(f"role IN ('{ROLE_CUSTOMER}', '{ROLE_ADMIN}')", name="role_valid"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    # None for an account created with a phone number alone (it may add an email later).
    email: Mapped[str | None] = mapped_column(String(320), unique=True)
    # E.164, e.g. "+14155550123". None for an account that signs in with an email only.
    phone: Mapped[str | None] = mapped_column(String(16), unique=True)
    # When a one-time code sent to the address / number was confirmed. Set for Google accounts
    # (Google vouches for the address). None: not verified; sign-in by password still works.
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # None for accounts that only sign in with Google (and for ones whose password was removed
    # when Google was linked): password login never succeeds for them.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(120))
    # Google's profile photo (an https URL), kept so the header can show it. None: initials.
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    # Read from the database on every admin request, never copied into the access token, so
    # demoting someone takes effect at once.
    role: Mapped[str] = mapped_column(String(20), server_default=ROLE_CUSTOMER)

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN

    @property
    def identifier(self) -> str:
        """What names the account where a single string is needed (log lines, failure counters,
        the "who" of an order event): the email, else the phone number."""
        return self.email or self.phone or f"user-{self.id}"


class OAuthIdentity(TimestampMixin, Base):
    """A login at an identity provider, e.g. ("google", Google's stable `sub`) -> a user. The
    subject, not the email, identifies the person: Google accounts can change their address."""

    __tablename__ = "oauth_identities"
    __table_args__ = (
        UniqueConstraint("provider", "subject"),
        Index("ix_oauth_identities_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    provider: Mapped[str] = mapped_column(String(20))
    subject: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(320))


class RefreshToken(TimestampMixin, Base):
    """One row per issued refresh token. Tokens rotate on every use and belong to a family (one
    login). Presenting a token that was already used means it leaked: the family is revoked."""

    __tablename__ = "refresh_tokens"
    __table_args__ = (
        Index("ix_refresh_tokens_user_id", "user_id"),
        Index("ix_refresh_tokens_family_id", "family_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    family_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # What the "your devices" list shows. Copied from the login to every token of its family.
    user_agent: Mapped[str | None] = mapped_column(String(300))
    ip: Mapped[str | None] = mapped_column(String(45))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class OtpChallenge(Base):
    """A one-time code that was sent to a phone number or an email address. Only an HMAC of the
    code is stored. A challenge is good for one purpose, expires, allows a few wrong guesses and
    is consumed by the first correct one."""

    __tablename__ = "otp_challenges"
    __table_args__ = (
        CheckConstraint(
            "purpose IN ('login', 'verify_email', 'verify_phone', 'change_email', "
            "'change_phone', 'reset_password')",
            name="purpose_valid",
        ),
        Index("ix_otp_challenges_destination", "destination", "purpose"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    purpose: Mapped[str] = mapped_column(String(20))
    # The E.164 number or the lower-cased email the code was sent to.
    destination: Mapped[str] = mapped_column(String(320))
    # Whose account asked (change / verify flows); None for login and password reset, where the
    # person is not signed in and the account is found by the destination.
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    code_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(SmallInteger, server_default="0")
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Address(TimestampMixin, Base):
    __tablename__ = "addresses"
    __table_args__ = (
        CheckConstraint("char_length(country) = 2", name="country_iso_length"),
        Index("ix_addresses_user_id", "user_id"),
        # At most one default address per user, enforced by the database.
        Index(
            "uq_addresses_one_default_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("is_default"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    full_name: Mapped[str] = mapped_column(String(120))
    line1: Mapped[str] = mapped_column(String(200))
    line2: Mapped[str | None] = mapped_column(String(200))
    city: Mapped[str] = mapped_column(String(100))
    region: Mapped[str | None] = mapped_column(String(100))
    postal_code: Mapped[str] = mapped_column(String(20))
    country: Mapped[str] = mapped_column(String(2))
    phone: Mapped[str | None] = mapped_column(String(30))
    is_default: Mapped[bool] = mapped_column(Boolean, server_default="false")
