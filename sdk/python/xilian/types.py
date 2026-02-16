"""西联平台 SDK 类型定义"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Literal, Optional
from enum import Enum


class DeviceStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    WARNING = "warning"
    ERROR = "error"


class AlgorithmType(str, Enum):
    FFT = "fft"
    ENVELOPE = "envelope"
    CEPSTRUM = "cepstrum"
    WAVELET = "wavelet"
    TREND = "trend"
    ORDER_TRACKING = "order-tracking"


class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertStatus(str, Enum):
    FIRING = "firing"
    RESOLVED = "resolved"
    ACKNOWLEDGED = "acknowledged"


@dataclass
class Device:
    id: str
    name: str
    device_type_id: str
    status: DeviceStatus
    metadata: dict[str, Any] = field(default_factory=dict)
    last_heartbeat: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


@dataclass
class CreateDeviceInput:
    name: str
    device_type_id: str
    metadata: Optional[dict[str, Any]] = None


@dataclass
class DeviceListParams:
    page: int = 1
    page_size: int = 20
    status: Optional[DeviceStatus] = None
    device_type_id: Optional[str] = None


@dataclass
class AlgorithmExecuteInput:
    algorithm_type: AlgorithmType
    signal_data: list[float]
    sample_rate: float
    parameters: Optional[dict[str, Any]] = None


@dataclass
class DiagnosticResult:
    fault_type: str
    severity: Literal["normal", "attention", "warning", "danger"]
    confidence: float
    description: str
    recommendations: list[str] = field(default_factory=list)


@dataclass
class AlgorithmResult:
    id: str
    algorithm_type: AlgorithmType
    status: Literal["pending", "running", "completed", "failed"]
    result: Optional[dict[str, Any]] = None
    duration: float = 0
    created_at: Optional[str] = None


@dataclass
class PipelineStage:
    name: str
    type: Literal["source", "transform", "sink", "branch", "aggregate"]
    config: dict[str, Any] = field(default_factory=dict)


@dataclass
class Pipeline:
    id: str
    name: str
    status: Literal["idle", "running", "paused", "error"]
    stages: list[PipelineStage] = field(default_factory=list)
    throughput: float = 0
    lag: int = 0


@dataclass
class KnowledgeEntry:
    id: str
    title: str
    content: str
    category: str
    tags: list[str] = field(default_factory=list)


@dataclass
class KnowledgeSearchInput:
    query: str
    top_k: int = 10
    category: Optional[str] = None
    use_graph_expansion: bool = True


@dataclass
class KnowledgeSearchResult:
    results: list[KnowledgeEntry] = field(default_factory=list)
    graph_relations: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class Alert:
    id: str
    rule_id: str
    severity: AlertSeverity
    status: AlertStatus
    device_id: str
    message: str
    fired_at: str
    resolved_at: Optional[str] = None


@dataclass
class AlertListParams:
    page: int = 1
    page_size: int = 20
    severity: Optional[AlertSeverity] = None
    status: Optional[AlertStatus] = None


@dataclass
class HealthStatus:
    status: Literal["healthy", "degraded", "unhealthy"]
    services: dict[str, dict[str, Any]] = field(default_factory=dict)
    uptime: float = 0
    version: str = ""


@dataclass
class PaginatedResult:
    data: list[Any] = field(default_factory=list)
    page: int = 1
    page_size: int = 20
    total: int = 0
    total_pages: int = 0
