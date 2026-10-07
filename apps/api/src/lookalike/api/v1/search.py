from typing import Annotated, Any

from fastapi import APIRouter, Depends, Form

from lookalike.core.deps import SearchServiceDep, SettingsDep
from lookalike.core.rate_limit import rate_limit
from lookalike.core.uploads import read_image_upload
from lookalike.schemas.problem import ProblemDetail
from lookalike.schemas.search import (
    HybridSearchForm,
    ImageSearchForm,
    SearchResponse,
    TextSearchRequest,
)
from lookalike.services.mappers import to_search_filters

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
    return await service.search_by_image(data, to_search_filters(form), form.limit)


@router.post(
    "/text",
    summary="Find products matching a description",
    dependencies=[Depends(rate_limit("text"))],
    responses={422: _UPLOAD_ERRORS[422], 429: _UPLOAD_ERRORS[429]},
)
async def search_by_text(body: TextSearchRequest, service: SearchServiceDep) -> SearchResponse:
    return await service.search_by_text(body.query, to_search_filters(body.filters), body.limit)


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
        data, form.query, form.text_weight, to_search_filters(form), form.limit
    )
