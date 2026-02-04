// Package service 提供核心业务逻辑
package service

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/xilian/realtime-aggregator/internal/config"
	"github.com/xilian/realtime-aggregator/internal/model"
	"go.uber.org/zap"
)

// AggregatorService 聚合服务
type AggregatorService struct {
	config  *config.Config
	logger  *zap.Logger
	windows sync.Map // map[string]*model.WindowState
	metrics *Metrics
	output  chan *model.AggregationResult
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup
}

// Metrics 服务指标
type Metrics struct {
	totalMessages     int64
	totalAggregations int64
	errorCount        int64
	latencySum        int64
	latencyCount      int64
	windowsActive     int64
	messagesPerSecond float64
	mu                sync.RWMutex
}

// NewAggregatorService 创建聚合服务
func NewAggregatorService(cfg *config.Config, logger *zap.Logger) *AggregatorService {
	ctx, cancel := context.WithCancel(context.Background())

	return &AggregatorService{
		config:  cfg,
		logger:  logger,
		metrics: &Metrics{},
		output:  make(chan *model.AggregationResult, cfg.Performance.BufferSize),
		ctx:     ctx,
		cancel:  cancel,
	}
}

// Start 启动服务
func (s *AggregatorService) Start() {
	// 启动窗口清理协程
	s.wg.Add(1)
	go s.windowCleaner()

	// 启动指标计算协程
	s.wg.Add(1)
	go s.metricsCalculator()

	// 启动输出处理协程
	for i := 0; i < s.config.Performance.Workers; i++ {
		s.wg.Add(1)
		go s.outputWorker(i)
	}

	s.logger.Info("Aggregator service started",
		zap.Duration("window_size", s.config.Aggregation.WindowSize),
		zap.Duration("slide_interval", s.config.Aggregation.SlideInterval),
	)
}

// Stop 停止服务
func (s *AggregatorService) Stop() {
	s.cancel()
	close(s.output)
	s.wg.Wait()
	s.logger.Info("Aggregator service stopped")
}

// Process 处理传感器读数
func (s *AggregatorService) Process(reading *model.SensorReading) error {
	startTime := time.Now()

	// 计算窗口
	windowStart := s.getWindowStart(reading.Timestamp)
	windowEnd := windowStart + s.config.Aggregation.WindowSize.Milliseconds()

	// 创建聚合键
	key := model.AggregationKey{
		DeviceID:    reading.DeviceID,
		SensorID:    reading.SensorID,
		WindowStart: windowStart,
	}
	keyStr := key.String()

	// 获取或创建窗口状态
	windowI, loaded := s.windows.LoadOrStore(keyStr, model.NewWindowState(key, windowStart, windowEnd))
	window := windowI.(*model.WindowState)

	if !loaded {
		atomic.AddInt64(&s.metrics.windowsActive, 1)
	}

	// 添加值到窗口
	window.Add(reading.Value, reading.Timestamp, reading.Unit)

	// 记录指标
	atomic.AddInt64(&s.metrics.totalMessages, 1)
	s.recordLatency(startTime)

	return nil
}

// ProcessBatch 批量处理
func (s *AggregatorService) ProcessBatch(readings []model.SensorReading) error {
	for _, reading := range readings {
		if err := s.Process(&reading); err != nil {
			atomic.AddInt64(&s.metrics.errorCount, 1)
		}
	}
	return nil
}

// getWindowStart 计算窗口开始时间
func (s *AggregatorService) getWindowStart(timestamp int64) int64 {
	windowMs := s.config.Aggregation.WindowSize.Milliseconds()
	return (timestamp / windowMs) * windowMs
}

// windowCleaner 窗口清理协程
func (s *AggregatorService) windowCleaner() {
	defer s.wg.Done()

	ticker := time.NewTicker(s.config.Aggregation.SlideInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.cleanupWindows()
		case <-s.ctx.Done():
			// 最终清理
			s.flushAllWindows()
			return
		}
	}
}

// cleanupWindows 清理过期窗口
func (s *AggregatorService) cleanupWindows() {
	now := time.Now().UnixMilli()
	windowMs := s.config.Aggregation.WindowSize.Milliseconds()
	cutoff := now - windowMs*2 // 保留两个窗口周期

	var toDelete []string

	s.windows.Range(func(key, value interface{}) bool {
		keyStr := key.(string)
		window := value.(*model.WindowState)

		// 检查窗口是否过期
		if window.WindowEnd < cutoff {
			// 发送聚合结果
			result := window.GetResult()
			select {
			case s.output <- result:
				atomic.AddInt64(&s.metrics.totalAggregations, 1)
			default:
				s.logger.Warn("Output buffer full, dropping aggregation result")
			}
			toDelete = append(toDelete, keyStr)
		}

		return true
	})

	// 删除过期窗口
	for _, key := range toDelete {
		s.windows.Delete(key)
		atomic.AddInt64(&s.metrics.windowsActive, -1)
	}

	if len(toDelete) > 0 {
		s.logger.Debug("Cleaned up windows",
			zap.Int("count", len(toDelete)),
		)
	}
}

// flushAllWindows 刷新所有窗口
func (s *AggregatorService) flushAllWindows() {
	s.windows.Range(func(key, value interface{}) bool {
		window := value.(*model.WindowState)
		result := window.GetResult()

		select {
		case s.output <- result:
			atomic.AddInt64(&s.metrics.totalAggregations, 1)
		default:
			s.logger.Warn("Output buffer full during flush")
		}

		return true
	})
}

// outputWorker 输出处理协程
func (s *AggregatorService) outputWorker(id int) {
	defer s.wg.Done()

	for {
		select {
		case result, ok := <-s.output:
			if !ok {
				return
			}
			// 这里可以发送到 Kafka 或 ClickHouse
			s.handleOutput(result)
		case <-s.ctx.Done():
			return
		}
	}
}

// handleOutput 处理输出
func (s *AggregatorService) handleOutput(result *model.AggregationResult) {
	// 日志记录（生产环境应发送到 Kafka/ClickHouse）
	s.logger.Debug("Aggregation result",
		zap.String("device_id", result.Key.DeviceID),
		zap.String("sensor_id", result.Key.SensorID),
		zap.Int64("count", result.Count),
		zap.Float64("avg", result.Avg),
		zap.Float64("min", result.Min),
		zap.Float64("max", result.Max),
	)
}

// metricsCalculator 指标计算协程
func (s *AggregatorService) metricsCalculator() {
	defer s.wg.Done()

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	var lastMessages int64
	var lastTime = time.Now()

	for {
		select {
		case <-ticker.C:
			currentMessages := atomic.LoadInt64(&s.metrics.totalMessages)
			currentTime := time.Now()

			elapsed := currentTime.Sub(lastTime).Seconds()
			if elapsed > 0 {
				s.metrics.mu.Lock()
				s.metrics.messagesPerSecond = float64(currentMessages-lastMessages) / elapsed
				s.metrics.mu.Unlock()
			}

			lastMessages = currentMessages
			lastTime = currentTime

		case <-s.ctx.Done():
			return
		}
	}
}

// recordLatency 记录延迟
func (s *AggregatorService) recordLatency(startTime time.Time) {
	latency := time.Since(startTime).Microseconds()
	atomic.AddInt64(&s.metrics.latencySum, latency)
	atomic.AddInt64(&s.metrics.latencyCount, 1)
}

// GetMetrics 获取指标
func (s *AggregatorService) GetMetrics() *model.AggregationMetrics {
	totalMessages := atomic.LoadInt64(&s.metrics.totalMessages)
	totalAggregations := atomic.LoadInt64(&s.metrics.totalAggregations)
	errorCount := atomic.LoadInt64(&s.metrics.errorCount)
	windowsActive := atomic.LoadInt64(&s.metrics.windowsActive)
	latencySum := atomic.LoadInt64(&s.metrics.latencySum)
	latencyCount := atomic.LoadInt64(&s.metrics.latencyCount)

	var avgLatency float64
	if latencyCount > 0 {
		avgLatency = float64(latencySum) / float64(latencyCount) / 1000.0
	}

	var errorRate float64
	if totalMessages > 0 {
		errorRate = float64(errorCount) / float64(totalMessages) * 100
	}

	s.metrics.mu.RLock()
	mps := s.metrics.messagesPerSecond
	s.metrics.mu.RUnlock()

	return &model.AggregationMetrics{
		TotalMessages:     totalMessages,
		TotalAggregations: totalAggregations,
		WindowsActive:     int(windowsActive),
		MessagesPerSecond: mps,
		AvgLatencyMs:      avgLatency,
		ErrorCount:        errorCount,
		ErrorRate:         errorRate,
	}
}

// GetHealthStatus 获取健康状态
func (s *AggregatorService) GetHealthStatus() *model.HealthStatus {
	metrics := s.GetMetrics()

	status := "healthy"
	if metrics.ErrorRate > 5 {
		status = "degraded"
	}
	if metrics.ErrorRate > 20 {
		status = "unhealthy"
	}

	return &model.HealthStatus{
		Status:    status,
		Timestamp: time.Now().UnixMilli(),
		Components: map[string]string{
			"windows": "ok",
			"output":  "ok",
		},
		Metrics: *metrics,
	}
}

// GetActiveWindows 获取活跃窗口列表
func (s *AggregatorService) GetActiveWindows() []model.WindowInfo {
	var windows []model.WindowInfo

	s.windows.Range(func(key, value interface{}) bool {
		window := value.(*model.WindowState)
		windows = append(windows, model.WindowInfo{
			Key:         window.Key,
			WindowStart: window.WindowStart,
			WindowEnd:   window.WindowEnd,
			Count:       window.Count,
			LastUpdate:  window.LastTime,
		})
		return true
	})

	return windows
}

// Query 查询聚合结果
func (s *AggregatorService) Query(req *model.QueryRequest) *model.QueryResponse {
	var results []model.AggregationResult

	s.windows.Range(func(key, value interface{}) bool {
		window := value.(*model.WindowState)

		// 过滤条件
		if req.DeviceID != "" && window.Key.DeviceID != req.DeviceID {
			return true
		}
		if req.SensorID != "" && window.Key.SensorID != req.SensorID {
			return true
		}
		if req.StartTime > 0 && window.WindowEnd < req.StartTime {
			return true
		}
		if req.EndTime > 0 && window.WindowStart > req.EndTime {
			return true
		}

		results = append(results, *window.GetResult())

		// 限制结果数量
		if req.Limit > 0 && len(results) >= req.Limit {
			return false
		}

		return true
	})

	return &model.QueryResponse{
		Results: results,
		Total:   len(results),
	}
}
