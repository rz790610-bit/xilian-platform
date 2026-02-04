// Package model 定义数据模型
package model

import (
	"encoding/json"
	"time"
)

// EventType 事件类型
type EventType string

const (
	EventTypeFault    EventType = "fault"
	EventTypeAlert    EventType = "alert"
	EventTypeSystem   EventType = "system"
	EventTypeMetric   EventType = "metric"
	EventTypeAudit    EventType = "audit"
	EventTypeCustom   EventType = "custom"
)

// EventPriority 事件优先级
type EventPriority int

const (
	PriorityLow      EventPriority = 0
	PriorityNormal   EventPriority = 1
	PriorityHigh     EventPriority = 2
	PriorityCritical EventPriority = 3
)

// Event 事件
type Event struct {
	ID        string            `json:"id"`
	Type      EventType         `json:"type"`
	Priority  EventPriority     `json:"priority"`
	Source    string            `json:"source"`
	Subject   string            `json:"subject"`
	Data      json.RawMessage   `json:"data"`
	Metadata  map[string]string `json:"metadata,omitempty"`
	Timestamp int64             `json:"timestamp"`
	CreatedAt int64             `json:"created_at"`
}

// ToJSON 转换为 JSON
func (e *Event) ToJSON() ([]byte, error) {
	return json.Marshal(e)
}

// FromJSON 从 JSON 解析
func (e *Event) FromJSON(data []byte) error {
	return json.Unmarshal(data, e)
}

// FaultEvent 故障事件
type FaultEvent struct {
	DeviceID    string `json:"device_id"`
	SensorID    string `json:"sensor_id"`
	FaultType   string `json:"fault_type"`
	Severity    string `json:"severity"`
	Description string `json:"description"`
	Value       float64 `json:"value,omitempty"`
	Threshold   float64 `json:"threshold,omitempty"`
}

// AlertEvent 告警事件
type AlertEvent struct {
	AlertID     string   `json:"alert_id"`
	RuleName    string   `json:"rule_name"`
	Severity    string   `json:"severity"`
	Message     string   `json:"message"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
	StartsAt    int64    `json:"starts_at"`
	EndsAt      int64    `json:"ends_at,omitempty"`
}

// SystemEvent 系统事件
type SystemEvent struct {
	Component string `json:"component"`
	Action    string `json:"action"`
	Status    string `json:"status"`
	Message   string `json:"message"`
	Details   map[string]interface{} `json:"details,omitempty"`
}

// Subscription 订阅
type Subscription struct {
	ID         string            `json:"id"`
	ClientID   string            `json:"client_id"`
	EventTypes []EventType       `json:"event_types"`
	Filters    map[string]string `json:"filters,omitempty"`
	CreatedAt  int64             `json:"created_at"`
}

// DispatchResult 分发结果
type DispatchResult struct {
	EventID     string `json:"event_id"`
	Success     bool   `json:"success"`
	Destination string `json:"destination"`
	StatusCode  int    `json:"status_code,omitempty"`
	Error       string `json:"error,omitempty"`
	Latency     int64  `json:"latency_ms"`
	Retries     int    `json:"retries"`
}

// DispatchMetrics 分发指标
type DispatchMetrics struct {
	TotalEvents       int64   `json:"total_events"`
	DispatchedEvents  int64   `json:"dispatched_events"`
	FailedEvents      int64   `json:"failed_events"`
	DeadLetterEvents  int64   `json:"dead_letter_events"`
	EventsPerSecond   float64 `json:"events_per_second"`
	AvgLatencyMs      float64 `json:"avg_latency_ms"`
	P99LatencyMs      float64 `json:"p99_latency_ms"`
	ActiveConnections int     `json:"active_connections"`
	Subscriptions     int     `json:"subscriptions"`
}

// HealthStatus 健康状态
type HealthStatus struct {
	Status     string            `json:"status"`
	Timestamp  int64             `json:"timestamp"`
	Components map[string]string `json:"components"`
	Metrics    DispatchMetrics   `json:"metrics"`
}

// WebSocketMessage WebSocket 消息
type WebSocketMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// Client WebSocket 客户端
type Client struct {
	ID           string
	Conn         interface{} // *websocket.Conn
	Subscriptions []Subscription
	SendChan     chan []byte
	CreatedAt    time.Time
	LastPing     time.Time
}

// PublishRequest 发布请求
type PublishRequest struct {
	Event Event `json:"event"`
}

// PublishResponse 发布响应
type PublishResponse struct {
	Success   bool   `json:"success"`
	EventID   string `json:"event_id"`
	Timestamp int64  `json:"timestamp"`
	Error     string `json:"error,omitempty"`
}

// BatchPublishRequest 批量发布请求
type BatchPublishRequest struct {
	Events []Event `json:"events"`
}

// BatchPublishResponse 批量发布响应
type BatchPublishResponse struct {
	Success      bool     `json:"success"`
	TotalCount   int      `json:"total_count"`
	SuccessCount int      `json:"success_count"`
	FailedCount  int      `json:"failed_count"`
	EventIDs     []string `json:"event_ids,omitempty"`
	Errors       []string `json:"errors,omitempty"`
}

// SubscribeRequest 订阅请求
type SubscribeRequest struct {
	EventTypes []EventType       `json:"event_types"`
	Filters    map[string]string `json:"filters,omitempty"`
}

// SubscribeResponse 订阅响应
type SubscribeResponse struct {
	Success        bool   `json:"success"`
	SubscriptionID string `json:"subscription_id"`
	Error          string `json:"error,omitempty"`
}
