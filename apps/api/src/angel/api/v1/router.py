from fastapi import APIRouter

from angel.api.v1 import admin
from angel.api.v1.accounts import addresses, auth
from angel.api.v1.catalog import catalog, products, search
from angel.api.v1.commerce import cart, checkout, orders, webhooks, wishlist
from angel.api.v1.reviews import reviews

router = APIRouter()
router.include_router(search.router)
router.include_router(products.router)
router.include_router(reviews.router)
router.include_router(catalog.router)
router.include_router(auth.router)
router.include_router(cart.router)
router.include_router(wishlist.router)
router.include_router(addresses.router)
router.include_router(checkout.router)
router.include_router(orders.router)
router.include_router(webhooks.router)
router.include_router(admin.router)
