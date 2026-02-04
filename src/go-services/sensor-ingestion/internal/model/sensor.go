// Package model 定义数据模型
package model

import (
	"encoding/json"
	"time"
)

// SensorReading 传感器读数
type SensorReading struct {
	// 设备 ID
	DeviceID string `json:"device_id" binding:"required"`
	// 传感器 ID
	SensorID string `json:"sensor_id" binding:"required"`
	// 读数值
	Value float64 `json:"value" binding:"required"`
	// 时间戳（毫秒）
	Timestamp int64 `json:"timestamp"`
	// 单位
	Unit string `json:"unit,omitempty"`
	// 质量标志 (0=正常, 1=可疑, 2=无效)
	Quality int `json:"quality,omitempty"`
	// 标签
	Tags map[string]string `json:"tags,omitempty"`
}

// BatchSensorReading 批量传感器读数
type BatchSensorReading struct {
	Readings []SensorReading `json:"readings" binding:"required,dive"`
}

// SensorReadingKafka Kafka 消息格式
type SensorReadingKafka struct {
	SensorReading
	// 接收时间
	ReceivedAt int64 `json:"received_at"`
	// 来源 IP
	SourceIP string `json:"source_ip,omitempty"`
	// 消息 ID
	MessageID string `json:"message_id"`
}

// ToJSON 转换为 JSON 字节
func (s *SensorReadingKafka) ToJSON() ([]byte, error) {
	return json.Marshal(s)
}

// FromJSON 从 JSON 字节解析
func (s *SensorReadingKafka) FromJSON(data []byte) error {
	return json.Unmarshal(data, s)
}

// SensorReadingClickHouse ClickHouse 存储格式
type SensorReadingClickHouse struct {
	DeviceID   string    `ch:"device_id"`
	SensorID   string    `ch:"sensor_id"`
	Value      float64   `ch:"value"`
	Timestamp  time.Time `ch:"timestamp"`
	Unit       string    `ch:"unit"`
	Quality    int8      `ch:"quality"`
	ReceivedAt time.Time `ch:"received_at"`
	Tags       string    `ch:"tags"` // JSON 格式
}

// ToClickHouse 转换为 ClickHouse 格式
func (s *SensorReadingKafka) ToClickHouse() *SensorReadingClickHouse {
	tagsJSON, _ := json.Marshal(s.Tags)
	return &SensorReadingClickHouse{
		DeviceID:   s.DeviceID,
		SensorID:   s.SensorID,
		Value:      s.Value,
		Timestamp:  time.UnixMilli(s.Timestamp),
		Unit:       s.Unit,
		Quality:    int8(s.Quality),
		ReceivedAt: time.UnixMilli(s.ReceivedAt),
		Tags:       string(tagsJSON),
	}
}

// IngestResponse 摄入响应
type IngestResponse struct {
	Success   bool   `json:"success"`
	MessageID string `json:"message_id,omitempty"`
	Count     int    `json:"count,omitempty"`
	Error     string `json:"error,omitempty"`
}

// BatchIngestResponse 批量摄入响应
type BatchIngestResponse struct {
	Success      bool     `json:"success"`
	TotalCount   int      `json:"total_count"`
	SuccessCount int      `json:"success_count"`
	FailedCount  int      `json:"failed_count"`
	MessageIDs   []string `json:"message_ids,omitempty"`
	Errors       []string `json:"errors,omitempty"`
}

// HealthStatus 健康状态
type HealthStatus struct {
	Status     string            `json:"status"`
	Timestamp  int64             `json:"timestamp"`
	Components map[string]string `json:"components"`
	Metrics    HealthMetrics     `json:"metrics"`
}

// HealthMetrics 健康指标
type HealthMetrics struct {
	// 每秒处理消息数
	MessagesPerSecond float64 `json:"messages_per_second"`
	// 缓冲区使用率
	BufferUsage float64 `json:"buffer_usage"`
	// 平均延迟（毫秒）
	AvgLatencyMs float64 `json:"avg_latency_ms"`
	// 错误率
	ErrorRate float64 `json:"error_rate"`
	// 活跃连接数
	ActiveConnections int `json:"active_connections"`
	// Goroutine 数量
	GoroutineCount int `json:"goroutine_count"`
	// 内存使用（MB）
	MemoryUsageMB float64 `json:"memory_usage_mb"`
}

// MetricsSnapshot 指标快照
type MetricsSnapshot struct {
	Timestamp         int64   `json:"timestamp"`
	TotalMessages     int64   `json:"total_messages"`
	TotalBytes        int64   `json:"total_bytes"`
	MessagesPerSecond float64 `json:"messages_per_second"`
	BytesPerSecond    float64 `json:"bytes_per_second"`
	AvgLatencyMs      float64 `json:"avg_latency_ms"`
	P99LatencyMs      float64 `json:"p99_latency_ms"`
	ErrorCount        int64   `json:"error_count"`
	ErrorRate         float64 `json:"error_rate"`
}
