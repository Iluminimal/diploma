from typing import Annotated, Any

from fastapi import APIRouter, Depends, Form

from angel.core.deps import SearchServiceDep, SettingsDep
from angel.core.rate_limit import rate_limit
from angel.core.uploads import read_image_upload
from angel.schemas.catalog.search import (
    DetectForm,
    DetectResponse,
    GarmentForm,
    GarmentSearchResponse,
    HybridSearchForm,
    ImageSearchForm,
    SearchResponse,
    TextSearchRequest,
)
from angel.schemas.problem import ProblemDetail
from angel.services.mappers import to_search_filters

router = APIRouter(prefix="/search", tags=["search"])

_UPLOAD_ERRORS: dict[int | str, dict[str, Any]] = {
    413: {"model": ProblemDetail, "description": "Image larger than the upload limit"},
    415: {"model": ProblemDetail, "description": "Not a JPEG, PNG or WebP upload"},
    422: {"model": ProblemDetail, "description": "Invalid image or parameters"},
    429: {"model": ProblemDetail, "description": "Rate limit exceeded"},
}


@router.post(
    "/image",
    summary="Find products that look like an uploaded photo",
    dependencies=[Depends(rate_limit("image"))],
    responses=_UPLOAD_ERRORS,
)
async def search_by_image(
    form: Annotated[ImageSearchForm, Form()],
    service: SearchServiceDep,
    settings: SettingsDep,
) -> SearchResponse:
    data = await read_image_upload(form.file, settings.max_upload_bytes)
    return await service.search_by_image(
        data, to_search_filters(form), form.limit, region=form.region
    )


@router.post(
    "/garments",
    summary="Find products for every garment in a photo",
    description=(
        "Detects the garments in the photo (shirt, trousers, shoes ...) and returns the similar "
        "products of each one, most prominent first. A photo with one garment (or none found) "
        "returns a single entry equal to `/search/image`."
    ),
    dependencies=[Depends(rate_limit("image"))],
    responses=_UPLOAD_ERRORS,
)
async def search_garments(
    form: Annotated[GarmentForm, Form()],
    service: SearchServiceDep,
    settings: SettingsDep,
) -> GarmentSearchResponse:
    data = await read_image_upload(form.file, settings.max_upload_bytes)
    return await service.search_garments(data, to_search_filters(form), form.limit)


@router.post(
    "/detect",
    summary="Find the garments in a camera frame (no search)",
    description=(
        "Lightweight detection for a live camera preview: returns the garment boxes of a frame "
        "without embedding or searching. Frames are never stored. Has its own, higher rate limit."
    ),
    dependencies=[Depends(rate_limit("detect"))],
    responses=_UPLOAD_ERRORS,
)
async def detect_garments(
    form: Annotated[DetectForm, Form()],
    service: SearchServiceDep,
    settings: SettingsDep,
) -> DetectResponse:
    data = await read_image_upload(form.file, settings.max_upload_bytes)
    return await service.detect_garments(data)


@router.post(
    "/text",
    summary="Find products matching a description",
    dependencies=[Depends(rate_limit("text"))],
    responses={422: _UPLOAD_ERRORS[422], 429: _UPLOAD_ERRORS[429]},
)
async def search_by_text(body: TextSearchRequest, service: SearchServiceDep) -> SearchResponse:
    return await service.search_by_text(
        body.query, to_search_filters(body.filters), body.limit, interpret=body.interpret
    )


@router.post(
    "/hybrid",
    summary="Find products like a photo, adjusted by a description",
    dependencies=[Depends(rate_limit("image"))],
    responses=_UPLOAD_ERRORS,
)
async def search_hybrid(
    form: Annotated[HybridSearchForm, Form()],
    service: SearchServiceDep,
    settings: SettingsDep,
) -> SearchResponse:
    data = await read_image_upload(form.file, settings.max_upload_bytes)
    return await service.search_hybrid(
        data,
        form.query,
        form.text_weight,
        to_search_filters(form),
        form.limit,
        interpret=form.interpret,
        region=form.region,
    )
