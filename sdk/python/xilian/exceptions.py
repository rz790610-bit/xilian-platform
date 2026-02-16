"""西联平台 SDK 异常定义"""

from __future__ import annotations
from typing import Any, Optional


class XilianError(Exception):
    """SDK 基础异常"""

    def __init__(
        self,
        message: str,
        status_code: int = 0,
        code: str = "UNKNOWN",
        details: Optional[dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.details = details or {}

    def __repr__(self) -> str:
        return f"XilianError(status={self.status_code}, code={self.code!r}, message={str(self)!r})"


class AuthenticationError(XilianError):
    """认证失败 (401)"""

    def __init__(self, message: str = "Authentication failed", **kwargs: Any):
        super().__init__(message, status_code=401, code="AUTH_FAILED", **kwargs)


class AuthorizationError(XilianError):
    """权限不足 (403)"""

    def __init__(self, message: str = "Permission denied", **kwargs: Any):
        super().__init__(message, status_code=403, code="FORBIDDEN", **kwargs)


class NotFoundError(XilianError):
    """资源不存在 (404)"""

    def __init__(self, message: str = "Resource not found", **kwargs: Any):
        super().__init__(message, status_code=404, code="NOT_FOUND", **kwargs)


class RateLimitError(XilianError):
    """请求频率超限 (429)"""

    def __init__(
        self,
        message: str = "Rate limit exceeded",
        retry_after: Optional[int] = None,
        **kwargs: Any,
    ):
        super().__init__(message, status_code=429, code="RATE_LIMITED", **kwargs)
        self.retry_after = retry_after


class ServiceUnavailableError(XilianError):
    """服务不可用 (503) — 断路器打开"""

    def __init__(self, message: str = "Service unavailable", **kwargs: Any):
        super().__init__(message, status_code=503, code="SERVICE_UNAVAILABLE", **kwargs)


# 状态码 → 异常类映射
STATUS_CODE_MAP: dict[int, type[XilianError]] = {
    401: AuthenticationError,
    403: AuthorizationError,
    404: NotFoundError,
    429: RateLimitError,
    503: ServiceUnavailableError,
}


def raise_for_status(status_code: int, body: dict[str, Any]) -> None:
    """根据 HTTP 状态码抛出对应异常"""
    if status_code < 400:
        return

    error_info = body.get("error", {})
    message = error_info.get("message", f"HTTP {status_code}")
    details = error_info.get("details")

    exc_class = STATUS_CODE_MAP.get(status_code, XilianError)
    raise exc_class(message=message, details=details)
