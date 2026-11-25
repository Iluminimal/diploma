# syntax=docker/dockerfile:1
# API (FastAPI). Build context: репозиторийн root (scripts/ орно):
#   docker build -f apps/api/Dockerfile -t angel-api .
# linux/amd64 ба linux/arm64; torch нь CPU wheel (`pyproject.toml` [tool.uv.sources]).
FROM python:3.12-slim-bookworm AS build
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project
COPY apps/api/alembic.ini ./
COPY apps/api/migrations ./migrations
COPY apps/api/src ./src
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev

FROM python:3.12-slim-bookworm AS run
# OpenCV (ultralytics)-ийн шаардлагатай хуваалцсан сангууд.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home-dir /app angel \
    && mkdir -p /data/media /hf \
    && chown -R angel /data /hf
WORKDIR /app
COPY --from=build --chown=angel /app /app
COPY --chown=angel scripts ./scripts
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    MEDIA_DIR=/data/media \
    HF_HOME=/hf \
    YOLO_CONFIG_DIR=/hf/ultralytics
USER angel
EXPOSE 8000
# /readyz нь загвар ачаалагдтал улаан: эхний асалтад загвар татахад хэдэн минут болно.
HEALTHCHECK --interval=15s --timeout=10s --start-period=600s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/readyz', timeout=8).status == 200 else 1)"
CMD ["uvicorn", "angel.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
