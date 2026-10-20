from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from angel.schemas.catalog.product import ProductOut

Size = Annotated[str, StringConstraints(strip_whitespace=True, max_length=16)]
# Тохируулсан дээд хэмжээг (CART_MAX_QUANTITY) service мөрдүүлнэ; энд зөвхөн оролтыг хязгаарлана.
Quantity = Annotated[int, Field(ge=1, le=99)]


class CartItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: Annotated[int, Field(ge=1, le=2**63 - 1)]
    # Размергүй бараанд хоосон; бусдад барааны размеруудын нэг байх ёстой.
    size: Size = ""
    quantity: Quantity = 1


class CartItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quantity: Quantity


# out_of_stock: дууссан эсвэл татагдсан. low_stock: cart-ын хүссэнээс цөөн үлдсэн.
CartIssue = Literal["out_of_stock", "low_stock"]


class CartLineOut(BaseModel):
    id: int
    product: ProductOut
    size: str
    quantity: int
    unit_price_cents: int
    line_total_cents: int
    # Одоо энэ мөрөөс захиалж болох дээд тоо (нөөц ба мөрийн хязгаар). UI өөрийн stepper-ийг үүгээр
    # хязгаарлана; яг нөөцийн түвшинг ил гаргахгүй.
    max_quantity: int
    issue: CartIssue | None = None


class CartOut(BaseModel):
    lines: list[CartLineOut]
    item_count: int
    subtotal_cents: int
    currency: str
    has_issues: bool
