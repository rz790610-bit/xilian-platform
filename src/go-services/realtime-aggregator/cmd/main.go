// Package main 服务入口
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/xilian/realtime-aggregator/internal/config"
	"github.com/xilian/realtime-aggregator/internal/model"
	"github.com/xilian/realtime-aggregator/internal/service"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

func main() {
	// 初始化日志
	logger := initLogger()
	defer logger.Sync()

	logger.Info("Starting realtime-aggregator service...")

	// 加载配置
	cfg := config.Load()
	logger.Info("Configuration loaded",
		zap.Duration("window_size", cfg.Aggregation.WindowSize),
		zap.Duration("slide_interval", cfg.Aggregation.SlideInterval),
	)

	// 创建聚合服务
	aggregator := service.NewAggregatorService(cfg, logger)
	aggregator.Start()

	// 创建 Gin 引擎
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	// 健康检查
	r.GET("/health", func(c *gin.Context) {
		status := aggregator.GetHealthStatus()
		httpStatus := http.StatusOK
		if status.Status == "unhealthy" {
			httpStatus = http.StatusServiceUnavailable
		}
		c.JSON(httpStatus, status)
	})

	r.GET("/ready", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ready": true})
	})

	r.GET("/live", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"alive": true})
	})

	// 指标
	r.GET("/metrics", func(c *gin.Context) {
		metrics := aggregator.GetMetrics()
		var memStats runtime.MemStats
		runtime.ReadMemStats(&memStats)

		c.JSON(http.StatusOK, gin.H{
			"aggregation": metrics,
			"runtime": gin.H{
				"goroutines":      runtime.NumGoroutine(),
				"memory_alloc_mb": float64(memStats.Alloc) / 1024 / 1024,
			},
		})
	})

	// API
	v1 := r.Group("/api/v1")
	{
		// 处理单条数据
		v1.POST("/process", func(c *gin.Context) {
			var reading model.SensorReading
			if err := c.ShouldBindJSON(&reading); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			if err := aggregator.Process(&reading); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}

			c.JSON(http.StatusOK, gin.H{"success": true})
		})

		// 批量处理
		v1.POST("/process/batch", func(c *gin.Context) {
			var batch struct {
				Readings []model.SensorReading `json:"readings"`
			}
			if err := c.ShouldBindJSON(&batch); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			if err := aggregator.ProcessBatch(batch.Readings); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"count":   len(batch.Readings),
			})
		})

		// 查询聚合结果
		v1.POST("/query", func(c *gin.Context) {
			var req model.QueryRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			response := aggregator.Query(&req)
			c.JSON(http.StatusOK, response)
		})

		// 获取活跃窗口
		v1.GET("/windows", func(c *gin.Context) {
			windows := aggregator.GetActiveWindows()
			c.JSON(http.StatusOK, gin.H{
				"windows": windows,
				"count":   len(windows),
			})
		})

		// 状态
		v1.GET("/status", func(c *gin.Context) {
			health := aggregator.GetHealthStatus()
			metrics := aggregator.GetMetrics()

			c.JSON(http.StatusOK, gin.H{
				"service": "realtime-aggregator",
				"version": "1.0.0",
				"status":  health.Status,
				"health":  health,
				"metrics": metrics,
			})
		})
	}

	// 创建 HTTP 服务器
	srv := &http.Server{
		Addr:         fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port),
		Handler:      r,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
	}

	// 启动服务器
	go func() {
		logger.Info("HTTP server starting", zap.String("addr", srv.Addr))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("HTTP server failed", zap.Error(err))
		}
	}()

	// 等待中断信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("Server forced to shutdown", zap.Error(err))
	}

	aggregator.Stop()
	logger.Info("Server exited")
}

func initLogger() *zap.Logger {
	config := zap.Config{
		Level:       zap.NewAtomicLevelAt(zap.InfoLevel),
		Development: false,
		Encoding:    "json",
		EncoderConfig: zapcore.EncoderConfig{
			TimeKey:        "timestamp",
			LevelKey:       "level",
			NameKey:        "logger",
			CallerKey:      "caller",
			MessageKey:     "message",
			StacktraceKey:  "stacktrace",
			LineEnding:     zapcore.DefaultLineEnding,
			EncodeLevel:    zapcore.LowercaseLevelEncoder,
			EncodeTime:     zapcore.ISO8601TimeEncoder,
			EncodeDuration: zapcore.MillisDurationEncoder,
			EncodeCaller:   zapcore.ShortCallerEncoder,
		},
		OutputPaths:      []string{"stdout"},
		ErrorOutputPaths: []string{"stderr"},
	}

	logger, err := config.Build()
	if err != nil {
		panic(err)
	}

	return logger
}
