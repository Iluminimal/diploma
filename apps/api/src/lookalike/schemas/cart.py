from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from lookalike.schemas.product import ProductOut

Size = Annotated[str, StringConstraints(strip_whitespace=True, max_length=16)]
# The configured maximum (CART_MAX_QUANTITY) is enforced by the service; this only bounds input.
Quantity = Annotated[int, Field(ge=1, le=99)]


class CartItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: Annotated[int, Field(ge=1, le=2**63 - 1)]
    # Empty for products without sizes; for the others it must be one of the product's sizes.
    size: Size = ""
    quantity: Quantity = 1


class CartItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quantity: Quantity


# out_of_stock: sold out or withdrawn. low_stock: fewer left than the cart asks for.
CartIssue = Literal["out_of_stock", "low_stock"]


class CartLineOut(BaseModel):
    id: int
    product: ProductOut
    size: str
    quantity: int
    unit_price_cents: int
    line_total_cents: int
    # The most the shopper can order of this line right now (stock and per-line limit). The UI
    # caps its stepper with it; the exact stock level itself is not exposed.
    max_quantity: int
    issue: CartIssue | None = None


class CartOut(BaseModel):
    lines: list[CartLineOut]
    item_count: int
    subtotal_cents: int
    currency: str
    has_issues: bool
