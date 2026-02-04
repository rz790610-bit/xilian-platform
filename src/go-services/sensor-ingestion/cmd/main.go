// Package main 服务入口
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/xilian/sensor-ingestion/internal/config"
	"github.com/xilian/sensor-ingestion/internal/handler"
	"github.com/xilian/sensor-ingestion/internal/middleware"
	"github.com/xilian/sensor-ingestion/internal/service"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

func main() {
	// 初始化日志
	logger := initLogger()
	defer logger.Sync()

	logger.Info("Starting sensor-ingestion service...")

	// 加载配置
	cfg := config.Load()
	logger.Info("Configuration loaded",
		zap.Int("workers", cfg.Performance.Workers),
		zap.Int("buffer_size", cfg.Performance.BufferSize),
		zap.Int("batch_size", cfg.Performance.BatchSize),
	)

	// 创建 Kafka 生产者（使用模拟实现，生产环境替换为真实实现）
	kafka := service.NewMockKafkaProducer()

	// 创建服务
	ingestionSvc := service.NewIngestionService(cfg, logger, kafka)
	ingestionSvc.Start()

	// 创建处理器
	h := handler.NewHandler(ingestionSvc, logger)

	// 创建 Gin 引擎
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()

	// 注册中间件
	rateLimiter := middleware.NewRateLimiter(int64(cfg.Performance.MaxConcurrent))
	concurrencyLimiter := middleware.NewConcurrencyLimiter(int64(cfg.Performance.MaxConcurrent))
	requestMetrics := middleware.NewRequestMetrics()

	r.Use(middleware.RecoveryMiddleware(logger))
	r.Use(middleware.RequestIDMiddleware())
	r.Use(middleware.CORSMiddleware())
	r.Use(middleware.LoggingMiddleware(logger))
	r.Use(middleware.MetricsMiddleware(requestMetrics))
	r.Use(middleware.RateLimitMiddleware(rateLimiter))
	r.Use(middleware.ConcurrencyMiddleware(concurrencyLimiter))

	// 注册路由
	h.RegisterRoutes(r)

	// 创建 HTTP 服务器
	srv := &http.Server{
		Addr:         fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port),
		Handler:      r,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		IdleTimeout:  cfg.Server.IdleTimeout,
	}

	// 启动服务器
	go func() {
		logger.Info("HTTP server starting",
			zap.String("addr", srv.Addr),
		)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("HTTP server failed", zap.Error(err))
		}
	}()

	// 等待中断信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	// 优雅关闭
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("Server forced to shutdown", zap.Error(err))
	}

	ingestionSvc.Stop()

	logger.Info("Server exited")
}

// initLogger 初始化日志
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
			FunctionKey:    zapcore.OmitKey,
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
