from typing import Protocol


class EmbeddingService(Protocol):
    """Seam between the API and the model. FashionCLIP implements this in the search phase;
    the rest of the app depends only on this protocol so the model can be swapped."""

    dimension: int

    def is_loaded(self) -> bool: ...
