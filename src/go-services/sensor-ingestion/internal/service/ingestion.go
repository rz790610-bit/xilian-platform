// Package service 提供核心业务逻辑
package service

import (
	"context"
	"encoding/json"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/xilian/sensor-ingestion/internal/config"
	"github.com/xilian/sensor-ingestion/internal/model"
	"go.uber.org/zap"
)

// IngestionService 数据摄入服务
type IngestionService struct {
	config  *config.Config
	logger  *zap.Logger
	buffer  chan *model.SensorReadingKafka
	metrics *Metrics
	kafka   KafkaProducer
	wg      sync.WaitGroup
	ctx     context.Context
	cancel  context.CancelFunc
}

// KafkaProducer Kafka 生产者接口
type KafkaProducer interface {
	WriteMessages(ctx context.Context, msgs ...KafkaMessage) error
	Close() error
}

// KafkaMessage Kafka 消息
type KafkaMessage struct {
	Key   []byte
	Value []byte
	Topic string
}

// Metrics 服务指标
type Metrics struct {
	totalMessages     int64
	totalBytes        int64
	successCount      int64
	errorCount        int64
	latencySum        int64
	latencyCount      int64
	bufferSize        int64
	lastResetTime     int64
	messagesPerSecond float64
	mu                sync.RWMutex
}

// NewIngestionService 创建摄入服务
func NewIngestionService(cfg *config.Config, logger *zap.Logger, kafka KafkaProducer) *IngestionService {
	ctx, cancel := context.WithCancel(context.Background())
	
	svc := &IngestionService{
		config:  cfg,
		logger:  logger,
		buffer:  make(chan *model.SensorReadingKafka, cfg.Performance.BufferSize),
		metrics: &Metrics{lastResetTime: time.Now().UnixMilli()},
		kafka:   kafka,
		ctx:     ctx,
		cancel:  cancel,
	}
	
	return svc
}

// Start 启动服务
func (s *IngestionService) Start() {
	// 启动工作协程
	for i := 0; i < s.config.Performance.Workers; i++ {
		s.wg.Add(1)
		go s.worker(i)
	}
	
	// 启动指标计算协程
	s.wg.Add(1)
	go s.metricsCalculator()
	
	s.logger.Info("Ingestion service started",
		zap.Int("workers", s.config.Performance.Workers),
		zap.Int("buffer_size", s.config.Performance.BufferSize),
	)
}

// Stop 停止服务
func (s *IngestionService) Stop() {
	s.cancel()
	close(s.buffer)
	s.wg.Wait()
	
	if s.kafka != nil {
		s.kafka.Close()
	}
	
	s.logger.Info("Ingestion service stopped")
}

// Ingest 摄入单条数据
func (s *IngestionService) Ingest(ctx context.Context, reading *model.SensorReading, sourceIP string) (*model.IngestResponse, error) {
	startTime := time.Now()
	
	// 设置默认时间戳
	if reading.Timestamp == 0 {
		reading.Timestamp = time.Now().UnixMilli()
	}
	
	// 创建 Kafka 消息
	kafkaReading := &model.SensorReadingKafka{
		SensorReading: *reading,
		ReceivedAt:    time.Now().UnixMilli(),
		SourceIP:      sourceIP,
		MessageID:     uuid.New().String(),
	}
	
	// 发送到缓冲区
	select {
	case s.buffer <- kafkaReading:
		atomic.AddInt64(&s.metrics.bufferSize, 1)
		s.recordLatency(startTime)
		atomic.AddInt64(&s.metrics.totalMessages, 1)
		
		return &model.IngestResponse{
			Success:   true,
			MessageID: kafkaReading.MessageID,
			Count:     1,
		}, nil
		
	case <-ctx.Done():
		atomic.AddInt64(&s.metrics.errorCount, 1)
		return &model.IngestResponse{
			Success: false,
			Error:   "context cancelled",
		}, ctx.Err()
		
	default:
		// 缓冲区满，尝试直接发送
		return s.directSend(ctx, kafkaReading, startTime)
	}
}

// IngestBatch 批量摄入数据
func (s *IngestionService) IngestBatch(ctx context.Context, readings []model.SensorReading, sourceIP string) (*model.BatchIngestResponse, error) {
	startTime := time.Now()
	
	response := &model.BatchIngestResponse{
		TotalCount: len(readings),
		MessageIDs: make([]string, 0, len(readings)),
	}
	
	for _, reading := range readings {
		// 设置默认时间戳
		if reading.Timestamp == 0 {
			reading.Timestamp = time.Now().UnixMilli()
		}
		
		kafkaReading := &model.SensorReadingKafka{
			SensorReading: reading,
			ReceivedAt:    time.Now().UnixMilli(),
			SourceIP:      sourceIP,
			MessageID:     uuid.New().String(),
		}
		
		select {
		case s.buffer <- kafkaReading:
			atomic.AddInt64(&s.metrics.bufferSize, 1)
			response.SuccessCount++
			response.MessageIDs = append(response.MessageIDs, kafkaReading.MessageID)
			
		case <-ctx.Done():
			response.FailedCount++
			response.Errors = append(response.Errors, "context cancelled")
			
		default:
			// 缓冲区满，记录错误
			response.FailedCount++
			response.Errors = append(response.Errors, "buffer full")
			atomic.AddInt64(&s.metrics.errorCount, 1)
		}
	}
	
	atomic.AddInt64(&s.metrics.totalMessages, int64(response.SuccessCount))
	s.recordLatency(startTime)
	
	response.Success = response.FailedCount == 0
	return response, nil
}

// directSend 直接发送到 Kafka（绕过缓冲区）
func (s *IngestionService) directSend(ctx context.Context, reading *model.SensorReadingKafka, startTime time.Time) (*model.IngestResponse, error) {
	data, err := reading.ToJSON()
	if err != nil {
		atomic.AddInt64(&s.metrics.errorCount, 1)
		return &model.IngestResponse{
			Success: false,
			Error:   "json marshal error: " + err.Error(),
		}, err
	}
	
	msg := KafkaMessage{
		Key:   []byte(reading.DeviceID),
		Value: data,
		Topic: s.config.Kafka.Topic,
	}
	
	if err := s.kafka.WriteMessages(ctx, msg); err != nil {
		atomic.AddInt64(&s.metrics.errorCount, 1)
		return &model.IngestResponse{
			Success: false,
			Error:   "kafka write error: " + err.Error(),
		}, err
	}
	
	atomic.AddInt64(&s.metrics.successCount, 1)
	atomic.AddInt64(&s.metrics.totalMessages, 1)
	atomic.AddInt64(&s.metrics.totalBytes, int64(len(data)))
	s.recordLatency(startTime)
	
	return &model.IngestResponse{
		Success:   true,
		MessageID: reading.MessageID,
		Count:     1,
	}, nil
}

// worker 工作协程
func (s *IngestionService) worker(id int) {
	defer s.wg.Done()
	
	batch := make([]*model.SensorReadingKafka, 0, s.config.Performance.BatchSize)
	ticker := time.NewTicker(s.config.Performance.FlushInterval)
	defer ticker.Stop()
	
	for {
		select {
		case reading, ok := <-s.buffer:
			if !ok {
				// 通道关闭，刷新剩余数据
				if len(batch) > 0 {
					s.flushBatch(batch)
				}
				return
			}
			
			atomic.AddInt64(&s.metrics.bufferSize, -1)
			batch = append(batch, reading)
			
			if len(batch) >= s.config.Performance.BatchSize {
				s.flushBatch(batch)
				batch = batch[:0]
			}
			
		case <-ticker.C:
			if len(batch) > 0 {
				s.flushBatch(batch)
				batch = batch[:0]
			}
			
		case <-s.ctx.Done():
			if len(batch) > 0 {
				s.flushBatch(batch)
			}
			return
		}
	}
}

// flushBatch 刷新批次到 Kafka
func (s *IngestionService) flushBatch(batch []*model.SensorReadingKafka) {
	if len(batch) == 0 {
		return
	}
	
	msgs := make([]KafkaMessage, 0, len(batch))
	var totalBytes int64
	
	for _, reading := range batch {
		data, err := reading.ToJSON()
		if err != nil {
			s.logger.Error("Failed to marshal reading",
				zap.String("device_id", reading.DeviceID),
				zap.Error(err),
			)
			atomic.AddInt64(&s.metrics.errorCount, 1)
			continue
		}
		
		msgs = append(msgs, KafkaMessage{
			Key:   []byte(reading.DeviceID),
			Value: data,
			Topic: s.config.Kafka.Topic,
		})
		totalBytes += int64(len(data))
	}
	
	if len(msgs) == 0 {
		return
	}
	
	ctx, cancel := context.WithTimeout(s.ctx, 5*time.Second)
	defer cancel()
	
	if err := s.kafka.WriteMessages(ctx, msgs...); err != nil {
		s.logger.Error("Failed to write batch to Kafka",
			zap.Int("batch_size", len(msgs)),
			zap.Error(err),
		)
		atomic.AddInt64(&s.metrics.errorCount, int64(len(msgs)))
		return
	}
	
	atomic.AddInt64(&s.metrics.successCount, int64(len(msgs)))
	atomic.AddInt64(&s.metrics.totalBytes, totalBytes)
}

// metricsCalculator 指标计算协程
func (s *IngestionService) metricsCalculator() {
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
func (s *IngestionService) recordLatency(startTime time.Time) {
	latency := time.Since(startTime).Microseconds()
	atomic.AddInt64(&s.metrics.latencySum, latency)
	atomic.AddInt64(&s.metrics.latencyCount, 1)
}

// GetMetrics 获取指标
func (s *IngestionService) GetMetrics() *model.MetricsSnapshot {
	totalMessages := atomic.LoadInt64(&s.metrics.totalMessages)
	totalBytes := atomic.LoadInt64(&s.metrics.totalBytes)
	errorCount := atomic.LoadInt64(&s.metrics.errorCount)
	latencySum := atomic.LoadInt64(&s.metrics.latencySum)
	latencyCount := atomic.LoadInt64(&s.metrics.latencyCount)
	
	var avgLatency float64
	if latencyCount > 0 {
		avgLatency = float64(latencySum) / float64(latencyCount) / 1000.0 // 转换为毫秒
	}
	
	var errorRate float64
	if totalMessages > 0 {
		errorRate = float64(errorCount) / float64(totalMessages) * 100
	}
	
	s.metrics.mu.RLock()
	mps := s.metrics.messagesPerSecond
	s.metrics.mu.RUnlock()
	
	return &model.MetricsSnapshot{
		Timestamp:         time.Now().UnixMilli(),
		TotalMessages:     totalMessages,
		TotalBytes:        totalBytes,
		MessagesPerSecond: mps,
		BytesPerSecond:    mps * 200, // 估算平均消息大小
		AvgLatencyMs:      avgLatency,
		ErrorCount:        errorCount,
		ErrorRate:         errorRate,
	}
}

// GetHealthStatus 获取健康状态
func (s *IngestionService) GetHealthStatus() *model.HealthStatus {
	metrics := s.GetMetrics()
	bufferSize := atomic.LoadInt64(&s.metrics.bufferSize)
	bufferUsage := float64(bufferSize) / float64(s.config.Performance.BufferSize) * 100
	
	status := "healthy"
	if metrics.ErrorRate > 5 {
		status = "degraded"
	}
	if metrics.ErrorRate > 20 || bufferUsage > 90 {
		status = "unhealthy"
	}
	
	return &model.HealthStatus{
		Status:    status,
		Timestamp: time.Now().UnixMilli(),
		Components: map[string]string{
			"kafka":  "connected",
			"buffer": "ok",
		},
		Metrics: model.HealthMetrics{
			MessagesPerSecond: metrics.MessagesPerSecond,
			BufferUsage:       bufferUsage,
			AvgLatencyMs:      metrics.AvgLatencyMs,
			ErrorRate:         metrics.ErrorRate,
		},
	}
}

// MockKafkaProducer 模拟 Kafka 生产者（用于测试）
type MockKafkaProducer struct {
	messages []KafkaMessage
	mu       sync.Mutex
	closed   bool
}

// NewMockKafkaProducer 创建模拟生产者
func NewMockKafkaProducer() *MockKafkaProducer {
	return &MockKafkaProducer{
		messages: make([]KafkaMessage, 0),
	}
}

// WriteMessages 写入消息
func (m *MockKafkaProducer) WriteMessages(ctx context.Context, msgs ...KafkaMessage) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	
	if m.closed {
		return nil
	}
	
	m.messages = append(m.messages, msgs...)
	return nil
}

// Close 关闭
func (m *MockKafkaProducer) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.closed = true
	return nil
}

// GetMessages 获取消息（测试用）
func (m *MockKafkaProducer) GetMessages() []KafkaMessage {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.messages
}

// MessageCount 获取消息数量
func (m *MockKafkaProducer) MessageCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.messages)
}

// ParseMessage 解析消息
func ParseMessage(msg KafkaMessage) (*model.SensorReadingKafka, error) {
	var reading model.SensorReadingKafka
	if err := json.Unmarshal(msg.Value, &reading); err != nil {
		return nil, err
	}
	return &reading, nil
}
