// Package model 定义数据模型
package model

import (
	"encoding/json"
	"math"
	"sync"
	"time"
)

// SensorReading 传感器读数（输入）
type SensorReading struct {
	DeviceID   string            `json:"device_id"`
	SensorID   string            `json:"sensor_id"`
	Value      float64           `json:"value"`
	Timestamp  int64             `json:"timestamp"`
	Unit       string            `json:"unit,omitempty"`
	Quality    int               `json:"quality,omitempty"`
	Tags       map[string]string `json:"tags,omitempty"`
	ReceivedAt int64             `json:"received_at,omitempty"`
	MessageID  string            `json:"message_id,omitempty"`
}

// FromJSON 从 JSON 解析
func (s *SensorReading) FromJSON(data []byte) error {
	return json.Unmarshal(data, s)
}

// AggregationKey 聚合键
type AggregationKey struct {
	DeviceID  string `json:"device_id"`
	SensorID  string `json:"sensor_id"`
	WindowStart int64 `json:"window_start"`
}

// String 转换为字符串
func (k AggregationKey) String() string {
	return k.DeviceID + ":" + k.SensorID + ":" + string(rune(k.WindowStart))
}

// AggregationResult 聚合结果
type AggregationResult struct {
	Key         AggregationKey `json:"key"`
	WindowStart int64          `json:"window_start"`
	WindowEnd   int64          `json:"window_end"`
	Count       int64          `json:"count"`
	Sum         float64        `json:"sum"`
	Avg         float64        `json:"avg"`
	Min         float64        `json:"min"`
	Max         float64        `json:"max"`
	StdDev      float64        `json:"std_dev"`
	Variance    float64        `json:"variance"`
	First       float64        `json:"first"`
	Last        float64        `json:"last"`
	P50         float64        `json:"p50"`
	P90         float64        `json:"p90"`
	P99         float64        `json:"p99"`
	Unit        string         `json:"unit,omitempty"`
	CreatedAt   int64          `json:"created_at"`
}

// ToJSON 转换为 JSON
func (r *AggregationResult) ToJSON() ([]byte, error) {
	return json.Marshal(r)
}

// WindowState 窗口状态（使用 Welford 在线算法）
type WindowState struct {
	Key         AggregationKey
	WindowStart int64
	WindowEnd   int64
	Count       int64
	Sum         float64
	Mean        float64
	M2          float64 // 用于计算方差
	Min         float64
	Max         float64
	First       float64
	Last        float64
	FirstTime   int64
	LastTime    int64
	Values      []float64 // 用于百分位数计算
	Unit        string
	mu          sync.Mutex
}

// NewWindowState 创建新窗口状态
func NewWindowState(key AggregationKey, windowStart, windowEnd int64) *WindowState {
	return &WindowState{
		Key:         key,
		WindowStart: windowStart,
		WindowEnd:   windowEnd,
		Min:         math.MaxFloat64,
		Max:         -math.MaxFloat64,
		Values:      make([]float64, 0, 1000),
	}
}

// Add 添加值（使用 Welford 算法增量计算）
func (w *WindowState) Add(value float64, timestamp int64, unit string) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.Count++
	w.Sum += value

	// Welford 在线算法
	delta := value - w.Mean
	w.Mean += delta / float64(w.Count)
	delta2 := value - w.Mean
	w.M2 += delta * delta2

	// 最小最大值
	if value < w.Min {
		w.Min = value
	}
	if value > w.Max {
		w.Max = value
	}

	// 首尾值
	if w.FirstTime == 0 || timestamp < w.FirstTime {
		w.First = value
		w.FirstTime = timestamp
	}
	if timestamp > w.LastTime {
		w.Last = value
		w.LastTime = timestamp
	}

	// 保存值用于百分位数计算（限制大小）
	if len(w.Values) < 10000 {
		w.Values = append(w.Values, value)
	}

	if w.Unit == "" {
		w.Unit = unit
	}
}

// GetResult 获取聚合结果
func (w *WindowState) GetResult() *AggregationResult {
	w.mu.Lock()
	defer w.mu.Unlock()

	var variance, stdDev float64
	if w.Count > 1 {
		variance = w.M2 / float64(w.Count-1)
		stdDev = math.Sqrt(variance)
	}

	// 计算百分位数
	p50, p90, p99 := w.calculatePercentiles()

	return &AggregationResult{
		Key:         w.Key,
		WindowStart: w.WindowStart,
		WindowEnd:   w.WindowEnd,
		Count:       w.Count,
		Sum:         w.Sum,
		Avg:         w.Mean,
		Min:         w.Min,
		Max:         w.Max,
		StdDev:      stdDev,
		Variance:    variance,
		First:       w.First,
		Last:        w.Last,
		P50:         p50,
		P90:         p90,
		P99:         p99,
		Unit:        w.Unit,
		CreatedAt:   time.Now().UnixMilli(),
	}
}

// calculatePercentiles 计算百分位数
func (w *WindowState) calculatePercentiles() (p50, p90, p99 float64) {
	if len(w.Values) == 0 {
		return 0, 0, 0
	}

	// 复制并排序
	sorted := make([]float64, len(w.Values))
	copy(sorted, w.Values)
	quickSort(sorted, 0, len(sorted)-1)

	n := len(sorted)
	p50 = sorted[int(float64(n)*0.50)]
	p90 = sorted[int(float64(n)*0.90)]
	p99Index := int(float64(n) * 0.99)
	if p99Index >= n {
		p99Index = n - 1
	}
	p99 = sorted[p99Index]

	return p50, p90, p99
}

// quickSort 快速排序
func quickSort(arr []float64, low, high int) {
	if low < high {
		pi := partition(arr, low, high)
		quickSort(arr, low, pi-1)
		quickSort(arr, pi+1, high)
	}
}

func partition(arr []float64, low, high int) int {
	pivot := arr[high]
	i := low - 1
	for j := low; j < high; j++ {
		if arr[j] < pivot {
			i++
			arr[i], arr[j] = arr[j], arr[i]
		}
	}
	arr[i+1], arr[high] = arr[high], arr[i+1]
	return i + 1
}

// AggregationMetrics 聚合指标
type AggregationMetrics struct {
	TotalMessages     int64   `json:"total_messages"`
	TotalAggregations int64   `json:"total_aggregations"`
	WindowsActive     int     `json:"windows_active"`
	MessagesPerSecond float64 `json:"messages_per_second"`
	AvgLatencyMs      float64 `json:"avg_latency_ms"`
	ErrorCount        int64   `json:"error_count"`
	ErrorRate         float64 `json:"error_rate"`
}

// HealthStatus 健康状态
type HealthStatus struct {
	Status     string             `json:"status"`
	Timestamp  int64              `json:"timestamp"`
	Components map[string]string  `json:"components"`
	Metrics    AggregationMetrics `json:"metrics"`
}

// WindowInfo 窗口信息
type WindowInfo struct {
	Key         AggregationKey `json:"key"`
	WindowStart int64          `json:"window_start"`
	WindowEnd   int64          `json:"window_end"`
	Count       int64          `json:"count"`
	LastUpdate  int64          `json:"last_update"`
}

// QueryRequest 查询请求
type QueryRequest struct {
	DeviceID  string `json:"device_id"`
	SensorID  string `json:"sensor_id"`
	StartTime int64  `json:"start_time"`
	EndTime   int64  `json:"end_time"`
	Limit     int    `json:"limit"`
}

// QueryResponse 查询响应
type QueryResponse struct {
	Results []AggregationResult `json:"results"`
	Total   int                 `json:"total"`
}
