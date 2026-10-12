from pydantic import BaseModel

from angel.schemas.catalog.product import ProductOut


class WishlistOut(BaseModel):
    items: list[ProductOut]
