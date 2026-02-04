// Package config 提供服务配置管理
package config

import (
	"os"
	"strconv"
	"time"
)

// Config 服务配置
type Config struct {
	// 服务配置
	Server ServerConfig
	// Kafka 配置
	Kafka KafkaConfig
	// Redis 配置
	Redis RedisConfig
	// ClickHouse 配置
	ClickHouse ClickHouseConfig
	// 性能配置
	Performance PerformanceConfig
}

// ServerConfig HTTP 服务器配置
type ServerConfig struct {
	Host         string
	Port         int
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	IdleTimeout  time.Duration
}

// KafkaConfig Kafka 配置
type KafkaConfig struct {
	Brokers       []string
	Topic         string
	BatchSize     int
	BatchTimeout  time.Duration
	RequiredAcks  int
	Compression   string
	MaxRetries    int
	RetryBackoff  time.Duration
}

// RedisConfig Redis 配置
type RedisConfig struct {
	Addr         string
	Password     string
	DB           int
	PoolSize     int
	MinIdleConns int
	MaxRetries   int
}

// ClickHouseConfig ClickHouse 配置
type ClickHouseConfig struct {
	Host          string
	Port          int
	Database      string
	Username      string
	Password      string
	MaxOpenConns  int
	MaxIdleConns  int
	BatchSize     int
	FlushInterval time.Duration
}

// PerformanceConfig 性能配置
type PerformanceConfig struct {
	// 工作协程数
	Workers int
	// 缓冲区大小
	BufferSize int
	// 批处理大小
	BatchSize int
	// 刷新间隔
	FlushInterval time.Duration
	// 最大并发请求数
	MaxConcurrent int
	// 请求超时
	RequestTimeout time.Duration
}

// Load 从环境变量加载配置
func Load() *Config {
	return &Config{
		Server: ServerConfig{
			Host:         getEnv("SERVER_HOST", "0.0.0.0"),
			Port:         getEnvInt("SERVER_PORT", 8080),
			ReadTimeout:  getEnvDuration("SERVER_READ_TIMEOUT", 5*time.Second),
			WriteTimeout: getEnvDuration("SERVER_WRITE_TIMEOUT", 10*time.Second),
			IdleTimeout:  getEnvDuration("SERVER_IDLE_TIMEOUT", 120*time.Second),
		},
		Kafka: KafkaConfig{
			Brokers:      getEnvSlice("KAFKA_BROKERS", []string{"localhost:9092"}),
			Topic:        getEnv("KAFKA_TOPIC", "sensor-data"),
			BatchSize:    getEnvInt("KAFKA_BATCH_SIZE", 1000),
			BatchTimeout: getEnvDuration("KAFKA_BATCH_TIMEOUT", 100*time.Millisecond),
			RequiredAcks: getEnvInt("KAFKA_REQUIRED_ACKS", 1),
			Compression:  getEnv("KAFKA_COMPRESSION", "lz4"),
			MaxRetries:   getEnvInt("KAFKA_MAX_RETRIES", 3),
			RetryBackoff: getEnvDuration("KAFKA_RETRY_BACKOFF", 100*time.Millisecond),
		},
		Redis: RedisConfig{
			Addr:         getEnv("REDIS_ADDR", "localhost:6379"),
			Password:     getEnv("REDIS_PASSWORD", ""),
			DB:           getEnvInt("REDIS_DB", 0),
			PoolSize:     getEnvInt("REDIS_POOL_SIZE", 100),
			MinIdleConns: getEnvInt("REDIS_MIN_IDLE_CONNS", 10),
			MaxRetries:   getEnvInt("REDIS_MAX_RETRIES", 3),
		},
		ClickHouse: ClickHouseConfig{
			Host:          getEnv("CLICKHOUSE_HOST", "localhost"),
			Port:          getEnvInt("CLICKHOUSE_PORT", 9000),
			Database:      getEnv("CLICKHOUSE_DATABASE", "xilian"),
			Username:      getEnv("CLICKHOUSE_USERNAME", "default"),
			Password:      getEnv("CLICKHOUSE_PASSWORD", ""),
			MaxOpenConns:  getEnvInt("CLICKHOUSE_MAX_OPEN_CONNS", 20),
			MaxIdleConns:  getEnvInt("CLICKHOUSE_MAX_IDLE_CONNS", 5),
			BatchSize:     getEnvInt("CLICKHOUSE_BATCH_SIZE", 10000),
			FlushInterval: getEnvDuration("CLICKHOUSE_FLUSH_INTERVAL", 1*time.Second),
		},
		Performance: PerformanceConfig{
			Workers:        getEnvInt("WORKERS", 16),
			BufferSize:     getEnvInt("BUFFER_SIZE", 100000),
			BatchSize:      getEnvInt("BATCH_SIZE", 1000),
			FlushInterval:  getEnvDuration("FLUSH_INTERVAL", 100*time.Millisecond),
			MaxConcurrent:  getEnvInt("MAX_CONCURRENT", 10000),
			RequestTimeout: getEnvDuration("REQUEST_TIMEOUT", 30*time.Second),
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
		// 简单实现，用逗号分隔
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
