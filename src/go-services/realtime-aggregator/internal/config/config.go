// Package config 提供服务配置管理
package config

import (
	"os"
	"strconv"
	"time"
)

// Config 服务配置
type Config struct {
	Server      ServerConfig
	Kafka       KafkaConfig
	Redis       RedisConfig
	ClickHouse  ClickHouseConfig
	Aggregation AggregationConfig
	Performance PerformanceConfig
}

// ServerConfig HTTP 服务器配置
type ServerConfig struct {
	Host         string
	Port         int
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
}

// KafkaConfig Kafka 配置
type KafkaConfig struct {
	Brokers      []string
	InputTopic   string
	OutputTopic  string
	GroupID      string
	MinBytes     int
	MaxBytes     int
	MaxWait      time.Duration
	CommitInterval time.Duration
}

// RedisConfig Redis 配置
type RedisConfig struct {
	Addr         string
	Password     string
	DB           int
	PoolSize     int
	MinIdleConns int
}

// ClickHouseConfig ClickHouse 配置
type ClickHouseConfig struct {
	Host          string
	Port          int
	Database      string
	Username      string
	Password      string
	MaxOpenConns  int
	BatchSize     int
	FlushInterval time.Duration
}

// AggregationConfig 聚合配置
type AggregationConfig struct {
	// 窗口大小（秒）
	WindowSize time.Duration
	// 滑动间隔（秒）
	SlideInterval time.Duration
	// 最大窗口数
	MaxWindows int
	// 聚合类型
	AggregationTypes []string
	// 设备分组
	GroupByDevice bool
	// 传感器分组
	GroupBySensor bool
}

// PerformanceConfig 性能配置
type PerformanceConfig struct {
	Workers        int
	BufferSize     int
	BatchSize      int
	FlushInterval  time.Duration
	MaxConcurrent  int
}

// Load 从环境变量加载配置
func Load() *Config {
	return &Config{
		Server: ServerConfig{
			Host:         getEnv("SERVER_HOST", "0.0.0.0"),
			Port:         getEnvInt("SERVER_PORT", 8081),
			ReadTimeout:  getEnvDuration("SERVER_READ_TIMEOUT", 5*time.Second),
			WriteTimeout: getEnvDuration("SERVER_WRITE_TIMEOUT", 10*time.Second),
		},
		Kafka: KafkaConfig{
			Brokers:        getEnvSlice("KAFKA_BROKERS", []string{"localhost:9092"}),
			InputTopic:     getEnv("KAFKA_INPUT_TOPIC", "sensor-data"),
			OutputTopic:    getEnv("KAFKA_OUTPUT_TOPIC", "aggregated-data"),
			GroupID:        getEnv("KAFKA_GROUP_ID", "realtime-aggregator"),
			MinBytes:       getEnvInt("KAFKA_MIN_BYTES", 1024),
			MaxBytes:       getEnvInt("KAFKA_MAX_BYTES", 10*1024*1024),
			MaxWait:        getEnvDuration("KAFKA_MAX_WAIT", 100*time.Millisecond),
			CommitInterval: getEnvDuration("KAFKA_COMMIT_INTERVAL", 1*time.Second),
		},
		Redis: RedisConfig{
			Addr:         getEnv("REDIS_ADDR", "localhost:6379"),
			Password:     getEnv("REDIS_PASSWORD", ""),
			DB:           getEnvInt("REDIS_DB", 0),
			PoolSize:     getEnvInt("REDIS_POOL_SIZE", 100),
			MinIdleConns: getEnvInt("REDIS_MIN_IDLE_CONNS", 10),
		},
		ClickHouse: ClickHouseConfig{
			Host:          getEnv("CLICKHOUSE_HOST", "localhost"),
			Port:          getEnvInt("CLICKHOUSE_PORT", 9000),
			Database:      getEnv("CLICKHOUSE_DATABASE", "xilian"),
			Username:      getEnv("CLICKHOUSE_USERNAME", "default"),
			Password:      getEnv("CLICKHOUSE_PASSWORD", ""),
			MaxOpenConns:  getEnvInt("CLICKHOUSE_MAX_OPEN_CONNS", 20),
			BatchSize:     getEnvInt("CLICKHOUSE_BATCH_SIZE", 10000),
			FlushInterval: getEnvDuration("CLICKHOUSE_FLUSH_INTERVAL", 1*time.Second),
		},
		Aggregation: AggregationConfig{
			WindowSize:       getEnvDuration("AGG_WINDOW_SIZE", 60*time.Second),
			SlideInterval:    getEnvDuration("AGG_SLIDE_INTERVAL", 10*time.Second),
			MaxWindows:       getEnvInt("AGG_MAX_WINDOWS", 100),
			AggregationTypes: []string{"count", "sum", "avg", "min", "max", "stddev"},
			GroupByDevice:    true,
			GroupBySensor:    true,
		},
		Performance: PerformanceConfig{
			Workers:       getEnvInt("WORKERS", 8),
			BufferSize:    getEnvInt("BUFFER_SIZE", 50000),
			BatchSize:     getEnvInt("BATCH_SIZE", 500),
			FlushInterval: getEnvDuration("FLUSH_INTERVAL", 100*time.Millisecond),
			MaxConcurrent: getEnvInt("MAX_CONCURRENT", 5000),
		},
	}
}

// 辅助函数
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}

func getEnvSlice(key string, defaultValue []string) []string {
	if value := os.Getenv(key); value != "" {
		var result []string
		current := ""
		for _, c := range value {
			if c == ',' {
				if current != "" {
					result = append(result, current)
					current = ""
				}
			} else {
				current += string(c)
			}
		}
		if current != "" {
			result = append(result, current)
		}
		if len(result) > 0 {
			return result
		}
	}
	return defaultValue
}
