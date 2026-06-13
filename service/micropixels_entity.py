from pydantic import BaseModel


class CompressResponse(BaseModel):
    filename: str
    input_size_bytes: int
    output_size_bytes: int
    compression_ratio: float


class RebuildResponse(BaseModel):
    filename: str
    output_size_bytes: int


class ErrorResponse(BaseModel):
    detail: str
