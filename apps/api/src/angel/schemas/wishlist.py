from pydantic import BaseModel

from angel.schemas.product import ProductOut


class WishlistOut(BaseModel):
    items: list[ProductOut]
