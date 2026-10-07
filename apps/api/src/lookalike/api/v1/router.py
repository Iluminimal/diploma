from fastapi import APIRouter

from lookalike.api.v1 import catalog, products, search

# Feature routers (cart, orders, ...) are mounted here as they are built.
router = APIRouter()
router.include_router(search.router)
router.include_router(products.router)
router.include_router(catalog.router)
