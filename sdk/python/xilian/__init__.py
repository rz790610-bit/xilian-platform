"""
西联工业物联网平台 Python SDK

使用方式:
    from xilian import XilianClient
    
    client = XilianClient(
        base_url="https://api.xilian.io/v1",
        token="your-jwt-token"
    )
    
    # 获取设备列表
    devices = client.devices.list(status="online")
    
    # 执行 FFT 算法
    result = client.algorithms.execute(
        algorithm_type="fft",
        signal_data=[...],
        sample_rate=25600,
        parameters={"window_function": "hanning", "fft_size": 4096}
    )
    
    # 知识语义搜索
    results = client.knowledge.search(query="轴承故障诊断", top_k=10)
"""

__version__ = "1.0.0"

from .client import XilianClient
from .exceptions import XilianError, AuthenticationError, RateLimitError, ServiceUnavailableError
from .types import (
    Device, CreateDeviceInput, DeviceListParams,
    AlgorithmType, AlgorithmExecuteInput, AlgorithmResult, DiagnosticResult,
    Pipeline, PipelineStage,
    KnowledgeEntry, KnowledgeSearchInput, KnowledgeSearchResult,
    Alert, AlertListParams,
    HealthStatus, PaginatedResult
)

__all__ = [
    "XilianClient",
    "XilianError", "AuthenticationError", "RateLimitError", "ServiceUnavailableError",
    "Device", "CreateDeviceInput", "DeviceListParams",
    "AlgorithmType", "AlgorithmExecuteInput", "AlgorithmResult", "DiagnosticResult",
    "Pipeline", "PipelineStage",
    "KnowledgeEntry", "KnowledgeSearchInput", "KnowledgeSearchResult",
    "Alert", "AlertListParams",
    "HealthStatus", "PaginatedResult"
]
