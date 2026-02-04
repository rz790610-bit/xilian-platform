// Package service 提供核心业务逻辑
package service

import (
	"context"
	"encoding/json"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/xilian/event-dispatcher/internal/config"
	"github.com/xilian/event-dispatcher/internal/model"
	"go.uber.org/zap"
)

// DispatcherService 事件分发服务
type DispatcherService struct {
	config        *config.Config
	logger        *zap.Logger
	eventBuffer   chan *model.Event
	metrics       *Metrics
	subscriptions sync.Map // map[string]*model.Subscription
	clients       sync.Map // map[string]*ClientWrapper
	ctx           context.Context
	cancel        context.CancelFunc
	wg            sync.WaitGroup
}

// ClientWrapper 客户端包装
type ClientWrapper struct {
	ID            string
	SendChan      chan []byte
	Subscriptions []model.Subscription
	CreatedAt     time.Time
	LastPing      time.Time
	mu            sync.RWMutex
}

// Metrics 服务指标
type Metrics struct {
	totalEvents       int64
	dispatchedEvents  int64
	failedEvents      int64
	deadLetterEvents  int64
	latencySum        int64
	latencyCount      int64
	eventsPerSecond   float64
	activeConnections int64
	subscriptions     int64
	mu                sync.RWMutex
}

// NewDispatcherService 创建分发服务
func NewDispatcherService(cfg *config.Config, logger *zap.Logger) *DispatcherService {
	ctx, cancel := context.WithCancel(context.Background())

	return &DispatcherService{
		config:      cfg,
		logger:      logger,
		eventBuffer: make(chan *model.Event, cfg.Performance.BufferSize),
		metrics:     &Metrics{},
		ctx:         ctx,
		cancel:      cancel,
	}
}

// Start 启动服务
func (s *DispatcherService) Start() {
	// 启动分发工作协程
	for i := 0; i < s.config.Performance.Workers; i++ {
		s.wg.Add(1)
		go s.dispatchWorker(i)
	}

	// 启动指标计算协程
	s.wg.Add(1)
	go s.metricsCalculator()

	// 启动客户端清理协程
	s.wg.Add(1)
	go s.clientCleaner()

	s.logger.Info("Dispatcher service started",
		zap.Int("workers", s.config.Performance.Workers),
		zap.Int("buffer_size", s.config.Performance.BufferSize),
	)
}

// Stop 停止服务
func (s *DispatcherService) Stop() {
	s.cancel()
	close(s.eventBuffer)
	s.wg.Wait()
	s.logger.Info("Dispatcher service stopped")
}

// Publish 发布事件
func (s *DispatcherService) Publish(event *model.Event) (*model.PublishResponse, error) {
	startTime := time.Now()

	// 设置默认值
	if event.ID == "" {
		event.ID = uuid.New().String()
	}
	if event.Timestamp == 0 {
		event.Timestamp = time.Now().UnixMilli()
	}
	event.CreatedAt = time.Now().UnixMilli()

	// 发送到缓冲区
	select {
	case s.eventBuffer <- event:
		atomic.AddInt64(&s.metrics.totalEvents, 1)
		s.recordLatency(startTime)

		return &model.PublishResponse{
			Success:   true,
			EventID:   event.ID,
			Timestamp: event.CreatedAt,
		}, nil

	case <-s.ctx.Done():
		return &model.PublishResponse{
			Success: false,
			Error:   "service shutting down",
		}, s.ctx.Err()

	default:
		// 缓冲区满
		atomic.AddInt64(&s.metrics.failedEvents, 1)
		return &model.PublishResponse{
			Success: false,
			Error:   "buffer full",
		}, nil
	}
}

// PublishBatch 批量发布事件
func (s *DispatcherService) PublishBatch(events []model.Event) (*model.BatchPublishResponse, error) {
	response := &model.BatchPublishResponse{
		TotalCount: len(events),
		EventIDs:   make([]string, 0, len(events)),
	}

	for _, event := range events {
		result, err := s.Publish(&event)
		if err != nil || !result.Success {
			response.FailedCount++
			if result != nil && result.Error != "" {
				response.Errors = append(response.Errors, result.Error)
			}
		} else {
			response.SuccessCount++
			response.EventIDs = append(response.EventIDs, result.EventID)
		}
	}

	response.Success = response.FailedCount == 0
	return response, nil
}

// Subscribe 订阅事件
func (s *DispatcherService) Subscribe(clientID string, req *model.SubscribeRequest) (*model.SubscribeResponse, error) {
	subscription := &model.Subscription{
		ID:         uuid.New().String(),
		ClientID:   clientID,
		EventTypes: req.EventTypes,
		Filters:    req.Filters,
		CreatedAt:  time.Now().UnixMilli(),
	}

	s.subscriptions.Store(subscription.ID, subscription)
	atomic.AddInt64(&s.metrics.subscriptions, 1)

	// 如果客户端存在，添加订阅
	if clientI, ok := s.clients.Load(clientID); ok {
		client := clientI.(*ClientWrapper)
		client.mu.Lock()
		client.Subscriptions = append(client.Subscriptions, *subscription)
		client.mu.Unlock()
	}

	return &model.SubscribeResponse{
		Success:        true,
		SubscriptionID: subscription.ID,
	}, nil
}

// Unsubscribe 取消订阅
func (s *DispatcherService) Unsubscribe(subscriptionID string) error {
	s.subscriptions.Delete(subscriptionID)
	atomic.AddInt64(&s.metrics.subscriptions, -1)
	return nil
}

// RegisterClient 注册客户端
func (s *DispatcherService) RegisterClient(clientID string) *ClientWrapper {
	client := &ClientWrapper{
		ID:            clientID,
		SendChan:      make(chan []byte, s.config.WebSocket.MessageBufferSize),
		Subscriptions: make([]model.Subscription, 0),
		CreatedAt:     time.Now(),
		LastPing:      time.Now(),
	}

	s.clients.Store(clientID, client)
	atomic.AddInt64(&s.metrics.activeConnections, 1)

	s.logger.Debug("Client registered", zap.String("client_id", clientID))
	return client
}

// UnregisterClient 注销客户端
func (s *DispatcherService) UnregisterClient(clientID string) {
	if clientI, ok := s.clients.Load(clientID); ok {
		client := clientI.(*ClientWrapper)
		close(client.SendChan)

		// 清理订阅
		client.mu.RLock()
		for _, sub := range client.Subscriptions {
			s.subscriptions.Delete(sub.ID)
			atomic.AddInt64(&s.metrics.subscriptions, -1)
		}
		client.mu.RUnlock()
	}

	s.clients.Delete(clientID)
	atomic.AddInt64(&s.metrics.activeConnections, -1)

	s.logger.Debug("Client unregistered", zap.String("client_id", clientID))
}

// dispatchWorker 分发工作协程
func (s *DispatcherService) dispatchWorker(id int) {
	defer s.wg.Done()

	for {
		select {
		case event, ok := <-s.eventBuffer:
			if !ok {
				return
			}
			s.dispatchEvent(event)

		case <-s.ctx.Done():
			return
		}
	}
}

// dispatchEvent 分发事件
func (s *DispatcherService) dispatchEvent(event *model.Event) {
	startTime := time.Now()

	// 序列化事件
	eventData, err := event.ToJSON()
	if err != nil {
		s.logger.Error("Failed to serialize event",
			zap.String("event_id", event.ID),
			zap.Error(err),
		)
		atomic.AddInt64(&s.metrics.failedEvents, 1)
		return
	}

	// 创建 WebSocket 消息
	wsMsg := model.WebSocketMessage{
		Type:    "event",
		Payload: eventData,
	}
	wsMsgData, _ := json.Marshal(wsMsg)

	// 分发给匹配的客户端
	dispatched := 0
	s.clients.Range(func(key, value interface{}) bool {
		client := value.(*ClientWrapper)

		// 检查订阅匹配
		if s.matchSubscription(client, event) {
			select {
			case client.SendChan <- wsMsgData:
				dispatched++
			default:
				// 客户端缓冲区满，跳过
				s.logger.Warn("Client buffer full",
					zap.String("client_id", client.ID),
				)
			}
		}

		return true
	})

	if dispatched > 0 {
		atomic.AddInt64(&s.metrics.dispatchedEvents, 1)
	}

	s.recordLatency(startTime)
}

// matchSubscription 检查订阅匹配
func (s *DispatcherService) matchSubscription(client *ClientWrapper, event *model.Event) bool {
	client.mu.RLock()
	defer client.mu.RUnlock()

	for _, sub := range client.Subscriptions {
		// 检查事件类型
		typeMatch := len(sub.EventTypes) == 0
		for _, t := range sub.EventTypes {
			if t == event.Type {
				typeMatch = true
				break
			}
		}

		if !typeMatch {
			continue
		}

		// 检查过滤器
		filterMatch := true
		for key, value := range sub.Filters {
			if metaValue, ok := event.Metadata[key]; !ok || metaValue != value {
				filterMatch = false
				break
			}
		}

		if filterMatch {
			return true
		}
	}

	return false
}

// clientCleaner 客户端清理协程
func (s *DispatcherService) clientCleaner() {
	defer s.wg.Done()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.cleanupInactiveClients()
		case <-s.ctx.Done():
			return
		}
	}
}

// cleanupInactiveClients 清理不活跃客户端
func (s *DispatcherService) cleanupInactiveClients() {
	timeout := s.config.WebSocket.PongTimeout * 3

	s.clients.Range(func(key, value interface{}) bool {
		client := value.(*ClientWrapper)
		if time.Since(client.LastPing) > timeout {
			s.UnregisterClient(client.ID)
			s.logger.Info("Cleaned up inactive client",
				zap.String("client_id", client.ID),
			)
		}
		return true
	})
}

// metricsCalculator 指标计算协程
func (s *DispatcherService) metricsCalculator() {
	defer s.wg.Done()

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	var lastEvents int64
	var lastTime = time.Now()

	for {
		select {
		case <-ticker.C:
			currentEvents := atomic.LoadInt64(&s.metrics.totalEvents)
			currentTime := time.Now()

			elapsed := currentTime.Sub(lastTime).Seconds()
			if elapsed > 0 {
				s.metrics.mu.Lock()
				s.metrics.eventsPerSecond = float64(currentEvents-lastEvents) / elapsed
				s.metrics.mu.Unlock()
			}

			lastEvents = currentEvents
			lastTime = currentTime

		case <-s.ctx.Done():
			return
		}
	}
}

// recordLatency 记录延迟
func (s *DispatcherService) recordLatency(startTime time.Time) {
	latency := time.Since(startTime).Microseconds()
	atomic.AddInt64(&s.metrics.latencySum, latency)
	atomic.AddInt64(&s.metrics.latencyCount, 1)
}

// GetMetrics 获取指标
func (s *DispatcherService) GetMetrics() *model.DispatchMetrics {
	totalEvents := atomic.LoadInt64(&s.metrics.totalEvents)
	dispatchedEvents := atomic.LoadInt64(&s.metrics.dispatchedEvents)
	failedEvents := atomic.LoadInt64(&s.metrics.failedEvents)
	deadLetterEvents := atomic.LoadInt64(&s.metrics.deadLetterEvents)
	activeConnections := atomic.LoadInt64(&s.metrics.activeConnections)
	subscriptions := atomic.LoadInt64(&s.metrics.subscriptions)
	latencySum := atomic.LoadInt64(&s.metrics.latencySum)
	latencyCount := atomic.LoadInt64(&s.metrics.latencyCount)

	var avgLatency float64
	if latencyCount > 0 {
		avgLatency = float64(latencySum) / float64(latencyCount) / 1000.0
	}

	s.metrics.mu.RLock()
	eps := s.metrics.eventsPerSecond
	s.metrics.mu.RUnlock()

	return &model.DispatchMetrics{
		TotalEvents:       totalEvents,
		DispatchedEvents:  dispatchedEvents,
		FailedEvents:      failedEvents,
		DeadLetterEvents:  deadLetterEvents,
		EventsPerSecond:   eps,
		AvgLatencyMs:      avgLatency,
		ActiveConnections: int(activeConnections),
		Subscriptions:     int(subscriptions),
	}
}

// GetHealthStatus 获取健康状态
func (s *DispatcherService) GetHealthStatus() *model.HealthStatus {
	metrics := s.GetMetrics()

	status := "healthy"
	failRate := float64(0)
	if metrics.TotalEvents > 0 {
		failRate = float64(metrics.FailedEvents) / float64(metrics.TotalEvents) * 100
	}

	if failRate > 5 {
		status = "degraded"
	}
	if failRate > 20 {
		status = "unhealthy"
	}

	return &model.HealthStatus{
		Status:    status,
		Timestamp: time.Now().UnixMilli(),
		Components: map[string]string{
			"buffer":    "ok",
			"websocket": "ok",
		},
		Metrics: *metrics,
	}
}

// UpdateClientPing 更新客户端心跳
func (s *DispatcherService) UpdateClientPing(clientID string) {
	if clientI, ok := s.clients.Load(clientID); ok {
		client := clientI.(*ClientWrapper)
		client.mu.Lock()
		client.LastPing = time.Now()
		client.mu.Unlock()
	}
}

// GetActiveClients 获取活跃客户端数量
func (s *DispatcherService) GetActiveClients() int {
	return int(atomic.LoadInt64(&s.metrics.activeConnections))
}

// GetSubscriptions 获取订阅列表
func (s *DispatcherService) GetSubscriptions() []model.Subscription {
	var subs []model.Subscription
	s.subscriptions.Range(func(key, value interface{}) bool {
		sub := value.(*model.Subscription)
		subs = append(subs, *sub)
		return true
	})
	return subs
}
