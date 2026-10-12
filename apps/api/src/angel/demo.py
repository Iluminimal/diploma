"""Demo data for development: customers, a month and a half of orders in every state, and
reviews, so the admin dashboard has something to show.

Everything is made up and deterministic for a given `--seed`. Customers are
`demo-<name>@example.com` with one known password; `clean` removes exactly what was made (and
gives the stock back). Orders go through the same tables checkout fills, with their history as
events, so the admin screens and the customer's order page read them like real ones. It never
runs against production.
"""

import argparse
import asyncio
import random
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from angel.core.config import Settings, get_settings
from angel.core.security import hash_password
from angel.db.engine import create_engine
from angel.models import (
    Address,
    Order,
    OrderEvent,
    OrderItem,
    Payment,
    Product,
    Review,
    User,
)
from angel.models.user import ROLE_CUSTOMER
from angel.schemas.commerce.order import ShippingMethodId
from angel.services.catalog.sizes import sizes_for
from angel.services.commerce.shipping import shipping_cost

# Share of delivered items whose buyer wrote a review.
REVIEW_CHANCE = 0.5
FRESH_STATUSES = {0: "pending", 1: "paid", 2: "paid"}
FRESH_STATUSES_END = 8
DEMO_PASSWORD = "DemoPass12345"  # noqa: S105 - development only, printed by the script
EMAIL_PREFIX = "demo-"
EMAIL_DOMAIN = "@example.com"
CARRIERS = {
    "DHL": lambda r: f"JD{r.randrange(10**11, 10**12)}",
    "UPS": lambda r: f"1Z{r.randrange(10**15, 10**16)}",
    "FedEx": lambda r: str(r.randrange(10**11, 10**12)),
    "USPS": lambda r: f"94{r.randrange(10**19, 10**20)}",
    "Royal Mail": lambda r: f"RM{r.randrange(10**8, 10**9)}GB",
}

FIRST = [
    "Ada",
    "Bruno",
    "Chloe",
    "Daniel",
    "Elena",
    "Felix",
    "Grace",
    "Hugo",
    "Iris",
    "Jonas",
    "Kira",
    "Liam",
    "Maya",
    "Noah",
    "Olivia",
    "Pavel",
    "Quinn",
    "Rosa",
    "Sam",
    "Tara",
    "Uma",
    "Victor",
    "Wren",
    "Xavier",
    "Yara",
    "Zoe",
    "Amir",
    "Bea",
    "Cleo",
    "Dev",
]
LAST = [
    "Anders",
    "Brooks",
    "Chen",
    "Diaz",
    "Evans",
    "Fischer",
    "Garcia",
    "Hughes",
    "Ito",
    "Jensen",
    "Khan",
    "Lopez",
    "Meyer",
    "Novak",
    "Okafor",
    "Patel",
    "Quinn",
    "Rossi",
    "Silva",
    "Tanaka",
    "Usman",
    "Vega",
    "Weber",
    "Young",
    "Zhang",
]
CITIES = (
    ("12 Market Street", "London", None, "N1 9GU", "GB"),
    ("48 Elm Avenue", "Boston", "MA", "02108", "US"),
    ("7 Rue des Fleurs", "Lyon", None, "69001", "FR"),
    ("301 Pine Road", "Portland", "OR", "97205", "US"),
    ("22 Hauptstrasse", "Berlin", None, "10115", "DE"),
    ("5 Harbour Lane", "Dublin", None, "D02 X285", "IE"),
    ("90 Lake Drive", "Chicago", "IL", "60601", "US"),
    ("14 Via Roma", "Milan", None, "20121", "IT"),
)
REVIEW_TEXT: dict[int, list[tuple[str, str]]] = {
    5: [
        ("Love it", "Exactly as pictured and the fabric feels great. Would buy again."),
        ("Perfect fit", "True to size and arrived quickly. Very happy with it."),
        ("Great quality", "Better than I expected for the price."),
    ],
    4: [
        ("Really good", "Nice quality. The colour is slightly different from the photo."),
        ("Happy overall", "Fits well and looks good, delivery took a day longer than expected."),
    ],
    3: [
        ("It is fine", "Does the job, but nothing special for the price."),
        ("Okay", "Runs a little small, otherwise as described."),
    ],
    2: [("Disappointed", "The material feels thinner than it looks online.")],
    1: [("Not for me", "Poor fit and the stitching came loose after one wash.")],
}


@dataclass(frozen=True)
class Summary:
    customers: int
    orders: int
    reviews: int
    statuses: dict[str, int]

    def __str__(self) -> str:
        by_status = ", ".join(f"{n} {s}" for s, n in sorted(self.statuses.items()))
        return (
            f"seeded {self.customers} customers, {self.orders} orders ({by_status}) and "
            f"{self.reviews} reviews. Sign in as demo customers with password {DEMO_PASSWORD}."
        )


DEMO_EMAILS = {"pattern": f"{EMAIL_PREFIX}%{EMAIL_DOMAIN}"}


async def seed_demo(
    engine: AsyncEngine,
    settings: Settings,
    *,
    customers: int = 25,
    orders: int = 80,
    days: int = 45,
    seed: int = 2026,
) -> Summary | None:
    """Add the demo data. None when it is already there (run `clean` first to start over)."""
    if settings.app_env == "prod":
        raise SystemExit("refusing to seed demo data when APP_ENV=prod")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session, session.begin():
        existing = await session.execute(
            text("SELECT 1 FROM users WHERE email LIKE :pattern LIMIT 1"), DEMO_EMAILS
        )
        if existing.first() is not None:
            return None
        pool = await _products(session)
        if not pool:
            raise SystemExit("there are no products to order: run `make ingest` first")
        admin = (
            await session.execute(
                text("SELECT id, email FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
            )
        ).first()
        rng = random.Random(seed)  # noqa: S311 - demo data, not security
        maker = _Maker(session, settings, rng, days, pool, admin)
        await maker.run(customers, orders)
    return Summary(customers, maker.orders_made, maker.reviews_made, dict(maker.statuses))


async def clean_demo(engine: AsyncEngine) -> str:
    """Remove the demo customers with their orders and reviews, put their stock back and
    recompute the ratings of the products they reviewed."""
    async with engine.begin() as connection:
        found = await connection.execute(
            text("SELECT id FROM users WHERE email LIKE :pattern"), DEMO_EMAILS
        )
        ids = found.scalars().all()
        if not ids:
            return "no demo data to remove"
        params: dict[str, Any] = {"ids": list(ids)}
        # Stock is held by every order that was not cancelled, and by a refunded one only when
        # its items were not put back at the time.
        await connection.execute(
            text(
                """
                UPDATE products p SET stock_quantity = p.stock_quantity + t.units
                FROM (
                    SELECT oi.product_id, SUM(oi.quantity) AS units
                    FROM order_items oi JOIN orders o ON o.id = oi.order_id
                    WHERE o.user_id = ANY(:ids) AND (
                        o.status IN ('pending', 'paid', 'shipped', 'delivered')
                        OR (o.status = 'refunded' AND EXISTS (
                            SELECT 1 FROM order_events e
                            WHERE e.order_id = o.id AND e.type = 'refunded'
                              AND e.data ->> 'restock' = 'false'))
                    )
                    GROUP BY oi.product_id
                ) t WHERE p.id = t.product_id
                """
            ),
            params,
        )
        reviewed = (
            (
                await connection.execute(
                    text("SELECT DISTINCT product_id FROM reviews WHERE user_id = ANY(:ids)"),
                    params,
                )
            )
            .scalars()
            .all()
        )
        orders = (
            await connection.execute(text("DELETE FROM orders WHERE user_id = ANY(:ids)"), params)
        ).rowcount
        await connection.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), params)
        await _recompute_ratings(connection, list(reviewed))
    return f"removed {len(ids)} demo customers and {orders} orders"


async def _recompute_ratings(connection: Any, product_ids: list[int]) -> None:
    if not product_ids:
        return
    await connection.execute(
        text(
            """
            UPDATE products SET
              rating_count = (SELECT COUNT(*) FROM reviews r
                              WHERE r.product_id = products.id AND r.status = 'published'),
              rating_average = COALESCE((SELECT ROUND(AVG(r.rating), 2) FROM reviews r
                              WHERE r.product_id = products.id AND r.status = 'published'), 0)
            WHERE id = ANY(:ids)
            """
        ),
        {"ids": product_ids},
    )


@dataclass
class _Item:
    product: Product
    size: str
    quantity: int


async def _products(session: AsyncSession) -> list[Product]:
    from sqlalchemy import select

    rows = await session.execute(
        select(Product)
        .where(Product.is_active.is_(True), Product.stock_quantity > 0)
        .order_by(Product.id)
        .limit(400)
    )
    return list(rows.scalars())


class _Maker:
    def __init__(
        self,
        session: AsyncSession,
        settings: Settings,
        rng: random.Random,
        days: int,
        pool: list[Product],
        admin: Any,
    ) -> None:
        self.session, self.settings, self.rng, self.days = session, settings, rng, days
        self.now = datetime.now(UTC).replace(microsecond=0)
        self.admin = admin
        shuffled = list(pool)
        rng.shuffle(shuffled)
        self.pool = shuffled
        # A few products sell far more than the rest, so "top products" is a real ranking.
        self.weights = [1 / (rank + 1) ** 0.9 for rank in range(len(shuffled))]
        self.stock = {p.id: p.stock_quantity for p in shuffled}
        self.sold: Counter[int] = Counter()
        self.statuses: Counter[str] = Counter()
        self.numbers: set[str] = set()
        self.orders_made = 0
        self.reviews_made = 0
        self.touched: set[int] = set()

    # --- customers ----------------------------------------------------------------------------

    async def run(self, customers: int, orders: int) -> None:
        people = await self._customers(customers)
        reviewed: set[tuple[int, int]] = set()
        for index in range(orders):
            await self._order(people, reviewed, index)
        await self.session.flush()
        for product_id, units in self.sold.items():
            await self.session.execute(
                text("UPDATE products SET stock_quantity = stock_quantity - :u WHERE id = :i"),
                {"u": units, "i": product_id},
            )
        await _recompute_ratings(await self.session.connection(), sorted(self.touched))

    async def _customers(self, count: int) -> list["_Person"]:
        password_hash = hash_password(DEMO_PASSWORD)
        names: set[str] = set()
        people: list[_Person] = []
        while len(people) < count:
            first, last = self.rng.choice(FIRST), self.rng.choice(LAST)
            if (first, last) in {(p.first, p.last) for p in people}:
                continue
            email = f"{EMAIL_PREFIX}{first}.{last}{EMAIL_DOMAIN}".lower()
            if email in names:
                continue
            names.add(email)
            # Most have been around a while; a third signed up within the period.
            joined_days_ago = (
                self.rng.uniform(0.2, self.days)
                if self.rng.random() < 0.3
                else self.rng.uniform(self.days + 1, self.days + 60)
            )
            joined = self.now - timedelta(days=joined_days_ago)
            user = User(
                email=email,
                password_hash=password_hash,
                full_name=f"{first} {last}",
                role=ROLE_CUSTOMER,
                is_active=len(people) != count - 1 or count < 5,
                created_at=joined,
                updated_at=joined,
            )
            self.session.add(user)
            await self.session.flush()
            street, city, region, postal, country = self.rng.choice(CITIES)
            address = Address(
                user_id=user.id,
                full_name=user.full_name,
                line1=street,
                city=city,
                region=region,
                postal_code=postal,
                country=country,
                is_default=True,
                created_at=joined,
                updated_at=joined,
            )
            self.session.add(address)
            people.append(
                _Person(
                    user,
                    first,
                    last,
                    joined_days_ago,
                    address,
                    self.rng.choice((0.3, 1, 1, 1, 3, 6)),
                )
            )
        return people

    # --- orders -------------------------------------------------------------------------------

    def _status_for(self, age_hours: float) -> str:
        table: list[tuple[float, dict[str, float]]] = [
            (1, {"pending": 0.6, "paid": 0.4}),
            (24, {"paid": 0.65, "shipped": 0.25, "cancelled": 0.07, "refunded": 0.03}),
            (
                72,
                {
                    "paid": 0.25,
                    "shipped": 0.45,
                    "delivered": 0.2,
                    "cancelled": 0.05,
                    "refunded": 0.05,
                },
            ),
            (192, {"shipped": 0.25, "delivered": 0.6, "cancelled": 0.05, "refunded": 0.1}),
            (float("inf"), {"delivered": 0.85, "refunded": 0.07, "cancelled": 0.08}),
        ]
        for limit, odds in table:
            if age_hours < limit:
                return self.rng.choices(list(odds), weights=list(odds.values()))[0]
        raise AssertionError("unreachable")

    def _items(self) -> list[_Item]:
        chosen: dict[int, _Item] = {}
        for _ in range(self.rng.choices((1, 2, 3), weights=(5, 3, 1))[0]):
            product = self.rng.choices(self.pool, weights=self.weights)[0]
            quantity = self.rng.choices((1, 2), weights=(4, 1))[0]
            if product.id in chosen or self.stock[product.id] < quantity:
                continue
            sizes = sizes_for(product)
            chosen[product.id] = _Item(product, self.rng.choice(sizes) if sizes else "", quantity)
        return list(chosen.values())

    def _number(self) -> str:
        while True:
            # new_order_number() is random; draw from the seeded generator instead.
            number = "LK-" + "".join(
                self.rng.choice("23456789ABCDEFGHJKLMNPQRSTUVWXYZ") for _ in range(8)
            )
            if number not in self.numbers:
                self.numbers.add(number)
                return number

    async def _order(
        self, people: list["_Person"], reviewed: set[tuple[int, int]], index: int
    ) -> None:
        rng = self.rng
        # The newest few are fixed: something awaiting payment and something just paid, then a
        # handful from today, the way a shop always looks. The rest thin out with age.
        fresh = FRESH_STATUSES.get(index)
        if fresh:
            age_days = rng.uniform(0.003, 0.03)
        elif index < FRESH_STATUSES_END:
            age_days = rng.uniform(0.05, 1.0)
        else:
            age_days = self.days * rng.random() ** 1.3
        created = self.now - timedelta(days=age_days)
        eligible = [p for p in people if p.joined_days_ago > age_days and p.user.is_active]
        items = self._items()
        if not eligible or not items:
            return
        person = rng.choices(eligible, weights=[p.weight for p in eligible])[0]
        status = fresh or self._status_for(age_days * 24)
        number = self._number()

        subtotal = sum(i.product.price_cents * i.quantity for i in items)
        method: ShippingMethodId = "express" if rng.random() < 0.2 else "standard"
        shipping = shipping_cost(self.settings, method, subtotal)
        # When things happened. A step that would land in the future is not reached yet.
        paid_at = created + timedelta(minutes=rng.uniform(1, 6))
        shipped_at = paid_at + timedelta(hours=rng.uniform(3, 30))
        delivered_at = shipped_at + timedelta(days=rng.uniform(1, 5))
        horizon = self.now - timedelta(minutes=1)
        refund_after = rng.choices(("paid", "shipped", "delivered"), weights=(2, 3, 5))[0]
        if status == "refunded":
            refund_after = _reachable(refund_after, paid_at, shipped_at, delivered_at, horizon)
            status_of_chain = refund_after
        else:
            status_of_chain = status
        if status in ("shipped", "delivered"):
            status = status_of_chain = _reachable(
                status, paid_at, shipped_at, delivered_at, horizon
            )
        if status == "pending":
            # Stays pending for the length of the expiry sweep, no longer.
            created = self.now - timedelta(minutes=rng.uniform(2, 12))
            paid_at = created
        if status in ("paid", "refunded") and paid_at > horizon:
            created = self.now - timedelta(minutes=30)
            paid_at = created + timedelta(minutes=2)

        order = Order(
            number=number,
            user_id=person.user.id,
            status=status,
            idempotency_key=f"demo-{number}",
            currency=self.settings.currency,
            subtotal_cents=subtotal,
            shipping_cents=shipping,
            total_cents=subtotal + shipping,
            shipping_method=method,
            shipping_address={
                "full_name": person.address.full_name,
                "line1": person.address.line1,
                "line2": None,
                "city": person.address.city,
                "region": person.address.region,
                "postal_code": person.address.postal_code,
                "country": person.address.country,
                "phone": None,
            },
            contact_email=person.user.email,
            created_at=created,
        )
        events: list[tuple[str, datetime, dict[str, Any], bool]] = [("placed", created, {}, False)]
        restock = rng.random() < 0.6
        last = created
        if status not in ("pending", "cancelled"):
            order.paid_at = paid_at
            last = paid_at
            events.append(("paid", paid_at, {"amount_cents": order.total_cents}, False))
            reached = status_of_chain
            if reached in ("shipped", "delivered"):
                carrier = rng.choice(list(CARRIERS))
                order.carrier, order.tracking_number = carrier, CARRIERS[carrier](rng)
                order.shipped_at = last = shipped_at
                events.append(
                    (
                        "shipped",
                        shipped_at,
                        {"carrier": carrier, "tracking_number": order.tracking_number},
                        True,
                    )
                )
            if reached == "delivered":
                order.delivered_at = last = delivered_at
                events.append(("delivered", delivered_at, {}, True))
            if status == "refunded":
                refunded_at = min(last + timedelta(hours=rng.uniform(2, 70)), horizon)
                order.refunded_at = last = max(refunded_at, last)
                reason = rng.choice(
                    ("Arrived damaged", "Did not fit", "Changed their mind", "Wrong item sent")
                )
                events.append(
                    (
                        "refunded",
                        last,
                        {"reason": reason, "restock": restock, "amount_cents": order.total_cents},
                        True,
                    )
                )
        if status == "cancelled":
            expired = rng.random() < 0.7
            cancelled_at = created + timedelta(
                minutes=rng.uniform(31, 90) if expired else rng.uniform(5, 600)
            )
            order.cancelled_at = last = min(cancelled_at, horizon)
            order.cancel_reason = "expired" if expired else "admin"
            events.append(("cancelled", last, {"reason": order.cancel_reason}, not expired))
        order.updated_at = last

        self.session.add(order)
        await self.session.flush()
        for item in items:
            self.session.add(
                OrderItem(
                    order_id=order.id,
                    product_id=item.product.id,
                    product_name=item.product.name,
                    product_slug=item.product.slug,
                    image_key=item.product.image_key,
                    size=item.size,
                    unit_price_cents=item.product.price_cents,
                    quantity=item.quantity,
                    created_at=created,
                    updated_at=created,
                )
            )
        payment_status = {
            "pending": "requires_payment",
            "cancelled": "canceled",
            "refunded": "refunded",
        }.get(status, "succeeded")
        self.session.add(
            Payment(
                order_id=order.id,
                provider="offline",
                provider_payment_id=f"pi_offline_demo_{number.lower()}",
                client_secret=f"pi_offline_demo_{number.lower()}_secret_offline"
                if status == "pending"
                else None,
                status=payment_status,
                amount_cents=order.total_cents,
                currency=order.currency,
                refund_id=f"re_offline_demo_{number.lower()}" if status == "refunded" else None,
                created_at=created,
                updated_at=last,
            )
        )
        for event_type, at, data, by_admin in events:
            if by_admin and self.admin is not None:
                data = {**data, "actor": self.admin.email}
            self.session.add(
                OrderEvent(
                    order_id=order.id,
                    type=event_type,
                    data=data,
                    actor_id=self.admin.id if by_admin and self.admin is not None else None,
                    created_at=at,
                    updated_at=at,
                )
            )

        holds_stock = status in ("pending", "paid", "shipped", "delivered") or (
            status == "refunded" and not restock
        )
        for item in items:
            self.stock[item.product.id] -= item.quantity
            if holds_stock:
                self.sold[item.product.id] += item.quantity
            else:
                # The sale never held stock (cancelled) or gave it back: undo the reservation.
                self.stock[item.product.id] += item.quantity
        self.orders_made += 1
        self.statuses[status] += 1
        await self._reviews(order, person, items, reviewed)

    async def _reviews(
        self, order: Order, person: "_Person", items: list[_Item], reviewed: set[tuple[int, int]]
    ) -> None:
        if order.status != "delivered" or order.delivered_at is None:
            return
        for item in items:
            key = (person.user.id, item.product.id)
            if key in reviewed or self.rng.random() >= REVIEW_CHANCE:
                continue
            posted = order.delivered_at + timedelta(days=self.rng.uniform(1, 10))
            if posted > self.now - timedelta(minutes=1):
                continue
            rating = self.rng.choices((5, 4, 3, 2, 1), weights=(50, 28, 12, 6, 4))[0]
            title, body = self.rng.choice(REVIEW_TEXT[rating])
            reviewed.add(key)
            self.session.add(
                Review(
                    product_id=item.product.id,
                    user_id=person.user.id,
                    order_id=order.id,
                    rating=rating,
                    title=title,
                    body=body if self.rng.random() < 0.8 else None,
                    status="hidden" if self.rng.random() < 0.04 else "published",
                    created_at=posted,
                    updated_at=posted,
                )
            )
            self.touched.add(item.product.id)
            self.reviews_made += 1


@dataclass
class _Person:
    user: User
    first: str
    last: str
    joined_days_ago: float
    address: Address
    weight: float


def _reachable(
    wanted: str, paid: datetime, shipped: datetime, delivered: datetime, horizon: datetime
) -> str:
    """The furthest stage of `wanted` (paid, shipped, delivered) that has happened by now."""
    if wanted == "delivered" and delivered <= horizon:
        return "delivered"
    if wanted in ("delivered", "shipped") and shipped <= horizon:
        return "shipped"
    return "paid"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="seed_demo", description=__doc__)
    parser.add_argument("--clean", action="store_true", help="remove the demo data instead")
    parser.add_argument("--customers", type=int, default=25)
    parser.add_argument("--orders", type=int, default=80)
    parser.add_argument("--days", type=int, default=45, help="how far back orders go")
    parser.add_argument("--seed", type=int, default=2026)
    args = parser.parse_args(argv)
    print(asyncio.run(_run(args)))
    return 0


async def _run(args: argparse.Namespace) -> str:
    settings = get_settings()
    if settings.app_env == "prod":
        raise SystemExit("refusing to touch demo data when APP_ENV=prod")
    engine = create_engine(settings.database_url)
    try:
        if args.clean:
            return await clean_demo(engine)
        summary = await seed_demo(
            engine,
            settings,
            customers=args.customers,
            orders=args.orders,
            days=args.days,
            seed=args.seed,
        )
    finally:
        await engine.dispose()
    return (
        str(summary) if summary else "demo data is already there (make seed-demo-clean removes it)"
    )
