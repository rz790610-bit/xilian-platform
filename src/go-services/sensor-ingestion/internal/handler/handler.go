// Package handler 提供 HTTP 请求处理
package handler

import (
	"net/http"
	"runtime"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/xilian/sensor-ingestion/internal/model"
	"github.com/xilian/sensor-ingestion/internal/service"
	"go.uber.org/zap"
)

// Handler HTTP 处理器
type Handler struct {
	ingestion *service.IngestionService
	logger    *zap.Logger
}

// NewHandler 创建处理器
func NewHandler(ingestion *service.IngestionService, logger *zap.Logger) *Handler {
	return &Handler{
		ingestion: ingestion,
		logger:    logger,
	}
}

// RegisterRoutes 注册路由
func (h *Handler) RegisterRoutes(r *gin.Engine) {
	// 健康检查
	r.GET("/health", h.Health)
	r.GET("/ready", h.Ready)
	r.GET("/live", h.Live)
	
	// 指标
	r.GET("/metrics", h.Metrics)
	
	// API v1
	v1 := r.Group("/api/v1")
	{
		// 数据摄入
		v1.POST("/ingest", h.Ingest)
		v1.POST("/ingest/batch", h.IngestBatch)
		
		// 状态
		v1.GET("/status", h.Status)
	}
}

// Health 健康检查
func (h *Handler) Health(c *gin.Context) {
	status := h.ingestion.GetHealthStatus()
	
	httpStatus := http.StatusOK
	if status.Status == "unhealthy" {
		httpStatus = http.StatusServiceUnavailable
	}
	
	c.JSON(httpStatus, status)
}

// Ready 就绪检查
func (h *Handler) Ready(c *gin.Context) {
	status := h.ingestion.GetHealthStatus()
	
	if status.Status == "unhealthy" {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"ready": false,
			"reason": "service unhealthy",
		})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"ready": true,
	})
}

// Live 存活检查
func (h *Handler) Live(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"alive": true,
		"timestamp": time.Now().UnixMilli(),
	})
}

// Metrics 指标端点
func (h *Handler) Metrics(c *gin.Context) {
	metrics := h.ingestion.GetMetrics()
	
	// 添加运行时指标
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	
	c.JSON(http.StatusOK, gin.H{
		"ingestion": metrics,
		"runtime": gin.H{
			"goroutines": runtime.NumGoroutine(),
			"memory_alloc_mb": float64(memStats.Alloc) / 1024 / 1024,
			"memory_sys_mb": float64(memStats.Sys) / 1024 / 1024,
			"gc_count": memStats.NumGC,
		},
	})
}

// Ingest 单条数据摄入
func (h *Handler) Ingest(c *gin.Context) {
	var reading model.SensorReading
	if err := c.ShouldBindJSON(&reading); err != nil {
		h.logger.Warn("Invalid request body",
			zap.Error(err),
			zap.String("client_ip", c.ClientIP()),
		)
		c.JSON(http.StatusBadRequest, model.IngestResponse{
			Success: false,
			Error:   "invalid request body: " + err.Error(),
		})
		return
	}
	
	response, err := h.ingestion.Ingest(c.Request.Context(), &reading, c.ClientIP())
	if err != nil {
		h.logger.Error("Ingest failed",
			zap.Error(err),
			zap.String("device_id", reading.DeviceID),
		)
		c.JSON(http.StatusInternalServerError, response)
		return
	}
	
	c.JSON(http.StatusOK, response)
}

// IngestBatch 批量数据摄入
func (h *Handler) IngestBatch(c *gin.Context) {
	var batch model.BatchSensorReading
	if err := c.ShouldBindJSON(&batch); err != nil {
		h.logger.Warn("Invalid batch request body",
			zap.Error(err),
			zap.String("client_ip", c.ClientIP()),
		)
		c.JSON(http.StatusBadRequest, model.BatchIngestResponse{
			Success: false,
			Errors:  []string{"invalid request body: " + err.Error()},
		})
		return
	}
	
	if len(batch.Readings) == 0 {
		c.JSON(http.StatusBadRequest, model.BatchIngestResponse{
			Success: false,
			Errors:  []string{"empty readings array"},
		})
		return
	}
	
	// 限制批量大小
	maxBatchSize := 10000
	if len(batch.Readings) > maxBatchSize {
		c.JSON(http.StatusBadRequest, model.BatchIngestResponse{
			Success: false,
			Errors:  []string{"batch size exceeds limit (max: 10000)"},
		})
		return
	}
	
	response, err := h.ingestion.IngestBatch(c.Request.Context(), batch.Readings, c.ClientIP())
	if err != nil {
		h.logger.Error("Batch ingest failed",
			zap.Error(err),
			zap.Int("batch_size", len(batch.Readings)),
		)
		c.JSON(http.StatusInternalServerError, response)
		return
	}
	
	c.JSON(http.StatusOK, response)
}

// Status 服务状态
func (h *Handler) Status(c *gin.Context) {
	health := h.ingestion.GetHealthStatus()
	metrics := h.ingestion.GetMetrics()
	
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	
	c.JSON(http.StatusOK, gin.H{
		"service": "sensor-ingestion",
		"version": "1.0.0",
		"status":  health.Status,
		"uptime":  time.Now().Unix(), // 简化，实际应记录启动时间
		"health":  health,
		"metrics": metrics,
		"runtime": gin.H{
			"go_version":      runtime.Version(),
			"goroutines":      runtime.NumGoroutine(),
			"cpus":            runtime.NumCPU(),
			"memory_alloc_mb": float64(memStats.Alloc) / 1024 / 1024,
			"memory_sys_mb":   float64(memStats.Sys) / 1024 / 1024,
		},
	})
}
