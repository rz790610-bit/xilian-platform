"""西联平台 SDK 主客户端"""

from __future__ import annotations

import time
import json
import logging
from typing import Any, Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode

from .exceptions import XilianError, RateLimitError, raise_for_status
from .types import (
    Device, CreateDeviceInput, DeviceListParams,
    AlgorithmExecuteInput, AlgorithmResult,
    Pipeline,
    KnowledgeSearchInput, KnowledgeSearchResult, KnowledgeEntry,
    Alert, AlertListParams,
    HealthStatus, PaginatedResult,
)

logger = logging.getLogger("xilian-sdk")


class _HttpClient:
    """底层 HTTP 客户端（零依赖，仅使用 urllib）"""

    def __init__(
        self,
        base_url: str,
        token: Optional[str] = None,
        timeout: int = 30,
        retries: int = 3,
    ):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self.retries = retries

    def set_token(self, token: str) -> None:
        self.token = token

    def request(
        self,
        method: str,
        path: str,
        body: Optional[dict[str, Any]] = None,
        params: Optional[dict[str, Any]] = None,
    ) -> Any:
        url = f"{self.base_url}{path}"
        if params:
            filtered = {k: v for k, v in params.items() if v is not None}
            if filtered:
                url += "?" + urlencode(filtered)

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-SDK-Version": "1.0.0",
            "X-SDK-Language": "python",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        data = json.dumps(body).encode("utf-8") if body else None

        last_error: Optional[Exception] = None
        for attempt in range(self.retries + 1):
            try:
                req = Request(url, data=data, headers=headers, method=method)
                with urlopen(req, timeout=self.timeout) as resp:
                    response_body = resp.read().decode("utf-8")
                    return json.loads(response_body) if response_body else None

            except HTTPError as e:
                response_body = e.read().decode("utf-8")
                try:
                    error_data = json.loads(response_body)
                except (json.JSONDecodeError, ValueError):
                    error_data = {}

                # 不重试 4xx（除 429）
                if 400 <= e.code < 500 and e.code != 429:
                    raise_for_status(e.code, error_data)

                last_error = e
                if attempt < self.retries:
                    delay = min(2**attempt, 10)
                    if e.code == 429:
                        retry_after = e.headers.get("Retry-After")
                        if retry_after:
                            delay = int(retry_after)
                    logger.warning(
                        "Request failed (attempt %d/%d), retrying in %ds: %s %s → %d",
                        attempt + 1, self.retries + 1, delay, method, path, e.code,
                    )
                    time.sleep(delay)
                    continue

                raise_for_status(e.code, error_data)

            except URLError as e:
                last_error = e
                if attempt < self.retries:
                    delay = min(2**attempt, 10)
                    logger.warning(
                        "Network error (attempt %d/%d), retrying in %ds: %s",
                        attempt + 1, self.retries + 1, delay, str(e),
                    )
                    time.sleep(delay)
                    continue

        raise XilianError(
            message=f"Request failed after {self.retries + 1} attempts: {last_error}",
            code="NETWORK_ERROR",
        )

    def get(self, path: str, params: Optional[dict[str, Any]] = None) -> Any:
        return self.request("GET", path, params=params)

    def post(self, path: str, body: Optional[dict[str, Any]] = None) -> Any:
        return self.request("POST", path, body=body)

    def put(self, path: str, body: Optional[dict[str, Any]] = None) -> Any:
        return self.request("PUT", path, body=body)

    def delete(self, path: str) -> Any:
        return self.request("DELETE", path)


# ── 子模块 API ──

class _DeviceAPI:
    def __init__(self, http: _HttpClient):
        self._http = http

    def list(self, **kwargs: Any) -> PaginatedResult:
        data = self._http.get("/devices", params=kwargs)
        return PaginatedResult(
            data=[Device(**d) for d in data.get("data", [])],
            page=data.get("pagination", {}).get("page", 1),
            page_size=data.get("pagination", {}).get("pageSize", 20),
            total=data.get("pagination", {}).get("total", 0),
            total_pages=data.get("pagination", {}).get("totalPages", 0),
        )

    def get(self, device_id: str) -> Device:
        data = self._http.get(f"/devices/{device_id}")
        return Device(**data)

    def create(self, input: CreateDeviceInput) -> Device:
        body = {"name": input.name, "deviceTypeId": input.device_type_id}
        if input.metadata:
            body["metadata"] = input.metadata
        data = self._http.post("/devices", body=body)
        return Device(**data)

    def update(self, device_id: str, **kwargs: Any) -> Device:
        data = self._http.put(f"/devices/{device_id}", body=kwargs)
        return Device(**data)

    def delete(self, device_id: str) -> None:
        self._http.delete(f"/devices/{device_id}")


class _AlgorithmAPI:
    def __init__(self, http: _HttpClient):
        self._http = http

    def execute(self, input: AlgorithmExecuteInput) -> AlgorithmResult:
        body: dict[str, Any] = {
            "algorithmType": input.algorithm_type.value if hasattr(input.algorithm_type, "value") else input.algorithm_type,
            "signalData": input.signal_data,
            "sampleRate": input.sample_rate,
        }
        if input.parameters:
            body["parameters"] = input.parameters
        data = self._http.post("/algorithms/execute", body=body)
        return AlgorithmResult(**data)

    def get_result(self, execution_id: str) -> AlgorithmResult:
        data = self._http.get(f"/algorithms/results/{execution_id}")
        return AlgorithmResult(**data)

    def list_types(self) -> list[dict[str, str]]:
        return self._http.get("/algorithms/types")


class _PipelineAPI:
    def __init__(self, http: _HttpClient):
        self._http = http

    def list(self) -> list[Pipeline]:
        data = self._http.get("/pipelines")
        return [Pipeline(**p) for p in data]

    def get(self, pipeline_id: str) -> Pipeline:
        data = self._http.get(f"/pipelines/{pipeline_id}")
        return Pipeline(**data)

    def start(self, pipeline_id: str) -> None:
        self._http.post(f"/pipelines/{pipeline_id}/start")

    def stop(self, pipeline_id: str) -> None:
        self._http.post(f"/pipelines/{pipeline_id}/stop")

    def pause(self, pipeline_id: str) -> None:
        self._http.post(f"/pipelines/{pipeline_id}/pause")


class _KnowledgeAPI:
    def __init__(self, http: _HttpClient):
        self._http = http

    def search(self, input: KnowledgeSearchInput) -> KnowledgeSearchResult:
        body: dict[str, Any] = {"query": input.query, "topK": input.top_k}
        if input.category:
            body["category"] = input.category
        body["useGraphExpansion"] = input.use_graph_expansion
        data = self._http.post("/knowledge/search", body=body)
        return KnowledgeSearchResult(
            results=[KnowledgeEntry(**r) for r in data.get("results", [])],
            graph_relations=data.get("graphRelations", []),
        )

    def get(self, entry_id: str) -> KnowledgeEntry:
        data = self._http.get(f"/knowledge/{entry_id}")
        return KnowledgeEntry(**data)


class _AlertAPI:
    def __init__(self, http: _HttpClient):
        self._http = http

    def list(self, **kwargs: Any) -> PaginatedResult:
        data = self._http.get("/alerts", params=kwargs)
        return PaginatedResult(
            data=[Alert(**a) for a in data.get("data", [])],
            page=data.get("pagination", {}).get("page", 1),
            page_size=data.get("pagination", {}).get("pageSize", 20),
            total=data.get("pagination", {}).get("total", 0),
            total_pages=data.get("pagination", {}).get("totalPages", 0),
        )

    def acknowledge(self, alert_id: str) -> None:
        self._http.post(f"/alerts/{alert_id}/acknowledge")

    def resolve(self, alert_id: str) -> None:
        self._http.post(f"/alerts/{alert_id}/resolve")


class _HealthAPI:
    def __init__(self, http: _HttpClient):
        self._http = http

    def check(self) -> HealthStatus:
        data = self._http.get("/health")
        return HealthStatus(**data)


# ── 主客户端 ──

class XilianClient:
    """
    西联平台 Python SDK 主客户端

    使用方式:
        client = XilianClient(base_url="https://api.xilian.io/v1", token="...")
        devices = client.devices.list(status="online")
    """

    def __init__(
        self,
        base_url: str = "https://api.xilian.io/v1",
        token: Optional[str] = None,
        timeout: int = 30,
        retries: int = 3,
    ):
        self._http = _HttpClient(
            base_url=base_url,
            token=token,
            timeout=timeout,
            retries=retries,
        )

        self.devices = _DeviceAPI(self._http)
        self.algorithms = _AlgorithmAPI(self._http)
        self.pipelines = _PipelineAPI(self._http)
        self.knowledge = _KnowledgeAPI(self._http)
        self.alerts = _AlertAPI(self._http)
        self.health = _HealthAPI(self._http)

    def set_token(self, token: str) -> None:
        """更新认证 Token"""
        self._http.set_token(token)
