from fastapi import APIRouter

from lookalike.api.v1 import (
    addresses,
    auth,
    cart,
    catalog,
    checkout,
    orders,
    products,
    search,
    webhooks,
    wishlist,
)

router = APIRouter()
router.include_router(search.router)
router.include_router(products.router)
router.include_router(catalog.router)
router.include_router(auth.router)
router.include_router(cart.router)
router.include_router(wishlist.router)
router.include_router(addresses.router)
router.include_router(checkout.router)
router.include_router(orders.router)
router.include_router(webhooks.router)
