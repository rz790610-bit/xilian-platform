// Package middleware 提供 HTTP 中间件
package middleware

import (
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// RateLimiter 限流器
type RateLimiter struct {
	// 每秒最大请求数
	maxRPS int64
	// 当前窗口请求数
	currentCount int64
	// 窗口开始时间
	windowStart int64
	// 窗口大小（秒）
	windowSize int64
	mu         sync.Mutex
}

// NewRateLimiter 创建限流器
func NewRateLimiter(maxRPS int64) *RateLimiter {
	return &RateLimiter{
		maxRPS:      maxRPS,
		windowStart: time.Now().Unix(),
		windowSize:  1,
	}
}

// Allow 检查是否允许请求
func (r *RateLimiter) Allow() bool {
	now := time.Now().Unix()
	
	r.mu.Lock()
	defer r.mu.Unlock()
	
	// 检查是否需要重置窗口
	if now-r.windowStart >= r.windowSize {
		r.currentCount = 0
		r.windowStart = now
	}
	
	// 检查是否超过限制
	if r.currentCount >= r.maxRPS {
		return false
	}
	
	r.currentCount++
	return true
}

// RateLimitMiddleware 限流中间件
func RateLimitMiddleware(limiter *RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !limiter.Allow() {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "rate limit exceeded",
				"retry_after": 1,
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// ConcurrencyLimiter 并发限制器
type ConcurrencyLimiter struct {
	maxConcurrent int64
	current       int64
}

// NewConcurrencyLimiter 创建并发限制器
func NewConcurrencyLimiter(max int64) *ConcurrencyLimiter {
	return &ConcurrencyLimiter{
		maxConcurrent: max,
	}
}

// Acquire 获取许可
func (c *ConcurrencyLimiter) Acquire() bool {
	current := atomic.AddInt64(&c.current, 1)
	if current > c.maxConcurrent {
		atomic.AddInt64(&c.current, -1)
		return false
	}
	return true
}

// Release 释放许可
func (c *ConcurrencyLimiter) Release() {
	atomic.AddInt64(&c.current, -1)
}

// Current 当前并发数
func (c *ConcurrencyLimiter) Current() int64 {
	return atomic.LoadInt64(&c.current)
}

// ConcurrencyMiddleware 并发限制中间件
func ConcurrencyMiddleware(limiter *ConcurrencyLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !limiter.Acquire() {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "too many concurrent requests",
			})
			c.Abort()
			return
		}
		defer limiter.Release()
		c.Next()
	}
}

// RequestMetrics 请求指标
type RequestMetrics struct {
	totalRequests   int64
	totalLatency    int64
	errorCount      int64
	statusCounts    sync.Map
}

// NewRequestMetrics 创建请求指标
func NewRequestMetrics() *RequestMetrics {
	return &RequestMetrics{}
}

// Record 记录请求
func (m *RequestMetrics) Record(status int, latency time.Duration) {
	atomic.AddInt64(&m.totalRequests, 1)
	atomic.AddInt64(&m.totalLatency, latency.Microseconds())
	
	if status >= 400 {
		atomic.AddInt64(&m.errorCount, 1)
	}
	
	// 记录状态码计数
	key := status / 100 * 100 // 按百位分组
	if val, ok := m.statusCounts.Load(key); ok {
		atomic.AddInt64(val.(*int64), 1)
	} else {
		var count int64 = 1
		m.statusCounts.Store(key, &count)
	}
}

// GetStats 获取统计
func (m *RequestMetrics) GetStats() map[string]interface{} {
	total := atomic.LoadInt64(&m.totalRequests)
	latency := atomic.LoadInt64(&m.totalLatency)
	errors := atomic.LoadInt64(&m.errorCount)
	
	var avgLatency float64
	if total > 0 {
		avgLatency = float64(latency) / float64(total) / 1000.0 // 毫秒
	}
	
	statusCounts := make(map[int]int64)
	m.statusCounts.Range(func(key, value interface{}) bool {
		statusCounts[key.(int)] = atomic.LoadInt64(value.(*int64))
		return true
	})
	
	return map[string]interface{}{
		"total_requests":  total,
		"error_count":     errors,
		"avg_latency_ms":  avgLatency,
		"status_counts":   statusCounts,
	}
}

// MetricsMiddleware 指标中间件
func MetricsMiddleware(metrics *RequestMetrics) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		metrics.Record(c.Writer.Status(), time.Since(start))
	}
}

// LoggingMiddleware 日志中间件
func LoggingMiddleware(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery
		
		c.Next()
		
		latency := time.Since(start)
		status := c.Writer.Status()
		
		// 只记录慢请求或错误
		if latency > 100*time.Millisecond || status >= 400 {
			logger.Info("HTTP Request",
				zap.String("method", c.Request.Method),
				zap.String("path", path),
				zap.String("query", query),
				zap.Int("status", status),
				zap.Duration("latency", latency),
				zap.String("client_ip", c.ClientIP()),
				zap.Int("body_size", c.Writer.Size()),
			)
		}
	}
}

// RecoveryMiddleware 恢复中间件
func RecoveryMiddleware(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				logger.Error("Panic recovered",
					zap.Any("error", err),
					zap.String("path", c.Request.URL.Path),
					zap.String("method", c.Request.Method),
				)
				
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": "internal server error",
				})
				c.Abort()
			}
		}()
		c.Next()
	}
}

// CORSMiddleware CORS 中间件
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization, X-Request-ID")
		c.Header("Access-Control-Max-Age", "86400")
		
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		
		c.Next()
	}
}

// RequestIDMiddleware 请求 ID 中间件
func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.GetHeader("X-Request-ID")
		if requestID == "" {
			requestID = generateRequestID()
		}
		
		c.Set("request_id", requestID)
		c.Header("X-Request-ID", requestID)
		c.Next()
	}
}

// generateRequestID 生成请求 ID
func generateRequestID() string {
	// 简单实现，生产环境应使用 UUID
	return time.Now().Format("20060102150405") + "-" + randomString(8)
}

// randomString 生成随机字符串
func randomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[time.Now().UnixNano()%int64(len(letters))]
	}
	return string(b)
}

// TimeoutMiddleware 超时中间件
func TimeoutMiddleware(timeout time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 设置请求超时
		c.Request = c.Request.WithContext(c.Request.Context())
		
		done := make(chan struct{})
		go func() {
			c.Next()
			close(done)
		}()
		
		select {
		case <-done:
			return
		case <-time.After(timeout):
			c.JSON(http.StatusGatewayTimeout, gin.H{
				"error": "request timeout",
			})
			c.Abort()
		}
	}
}
