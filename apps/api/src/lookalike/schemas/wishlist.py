from pydantic import BaseModel

from lookalike.schemas.product import ProductOut


class WishlistOut(BaseModel):
    items: list[ProductOut]
