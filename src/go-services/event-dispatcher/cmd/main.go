// Package main 服务入口
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/xilian/event-dispatcher/internal/config"
	"github.com/xilian/event-dispatcher/internal/model"
	"github.com/xilian/event-dispatcher/internal/service"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

func main() {
	// 初始化日志
	logger := initLogger()
	defer logger.Sync()

	logger.Info("Starting event-dispatcher service...")

	// 加载配置
	cfg := config.Load()
	logger.Info("Configuration loaded",
		zap.Int("workers", cfg.Performance.Workers),
		zap.Int("buffer_size", cfg.Performance.BufferSize),
		zap.Bool("websocket_enabled", cfg.WebSocket.Enabled),
	)

	// 创建分发服务
	dispatcher := service.NewDispatcherService(cfg, logger)
	dispatcher.Start()

	// 创建 Gin 引擎
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	// 健康检查
	r.GET("/health", func(c *gin.Context) {
		status := dispatcher.GetHealthStatus()
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
		metrics := dispatcher.GetMetrics()
		var memStats runtime.MemStats
		runtime.ReadMemStats(&memStats)

		c.JSON(http.StatusOK, gin.H{
			"dispatcher": metrics,
			"runtime": gin.H{
				"goroutines":      runtime.NumGoroutine(),
				"memory_alloc_mb": float64(memStats.Alloc) / 1024 / 1024,
			},
		})
	})

	// API
	v1 := r.Group("/api/v1")
	{
		// 发布事件
		v1.POST("/publish", func(c *gin.Context) {
			var req model.PublishRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			response, err := dispatcher.Publish(&req.Event)
			if err != nil {
				c.JSON(http.StatusInternalServerError, response)
				return
			}

			c.JSON(http.StatusOK, response)
		})

		// 批量发布
		v1.POST("/publish/batch", func(c *gin.Context) {
			var req model.BatchPublishRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			response, err := dispatcher.PublishBatch(req.Events)
			if err != nil {
				c.JSON(http.StatusInternalServerError, response)
				return
			}

			c.JSON(http.StatusOK, response)
		})

		// 订阅
		v1.POST("/subscribe", func(c *gin.Context) {
			clientID := c.GetHeader("X-Client-ID")
			if clientID == "" {
				clientID = c.ClientIP()
			}

			var req model.SubscribeRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			response, err := dispatcher.Subscribe(clientID, &req)
			if err != nil {
				c.JSON(http.StatusInternalServerError, response)
				return
			}

			c.JSON(http.StatusOK, response)
		})

		// 取消订阅
		v1.DELETE("/subscribe/:id", func(c *gin.Context) {
			subscriptionID := c.Param("id")
			if err := dispatcher.Unsubscribe(subscriptionID); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}

			c.JSON(http.StatusOK, gin.H{"success": true})
		})

		// 获取订阅列表
		v1.GET("/subscriptions", func(c *gin.Context) {
			subs := dispatcher.GetSubscriptions()
			c.JSON(http.StatusOK, gin.H{
				"subscriptions": subs,
				"count":         len(subs),
			})
		})

		// 状态
		v1.GET("/status", func(c *gin.Context) {
			health := dispatcher.GetHealthStatus()
			metrics := dispatcher.GetMetrics()

			c.JSON(http.StatusOK, gin.H{
				"service": "event-dispatcher",
				"version": "1.0.0",
				"status":  health.Status,
				"health":  health,
				"metrics": metrics,
			})
		})
	}

	// WebSocket 端点（简化实现）
	r.GET("/ws", func(c *gin.Context) {
		// 注册客户端
		clientID := c.Query("client_id")
		if clientID == "" {
			clientID = c.ClientIP() + "-" + time.Now().Format("150405")
		}

		client := dispatcher.RegisterClient(clientID)
		defer dispatcher.UnregisterClient(clientID)

		// 设置响应头
		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")
		c.Header("X-Accel-Buffering", "no")

		// SSE 流
		c.Stream(func(w io.Writer) bool {
			select {
			case msg, ok := <-client.SendChan:
				if !ok {
					return false
				}
				c.SSEvent("message", string(msg))
				return true
			case <-c.Request.Context().Done():
				return false
			case <-time.After(30 * time.Second):
				// 发送心跳
				c.SSEvent("ping", time.Now().UnixMilli())
				return true
			}
		})
	})

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

	dispatcher.Stop()
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

// io.Writer 接口
type io interface {
	Writer
}

type Writer interface {
	Write(p []byte) (n int, err error)
}
