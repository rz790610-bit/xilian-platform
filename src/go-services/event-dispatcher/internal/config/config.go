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
	Dispatcher  DispatcherConfig
	WebSocket   WebSocketConfig
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
	Brokers        []string
	Topics         []string
	GroupID        string
	MinBytes       int
	MaxBytes       int
	MaxWait        time.Duration
	CommitInterval time.Duration
}

// RedisConfig Redis 配置
type RedisConfig struct {
	Addr         string
	Password     string
	DB           int
	PoolSize     int
	MinIdleConns int
	PubSubChannel string
}

// DispatcherConfig 分发配置
type DispatcherConfig struct {
	// 路由规则
	Routes []RouteConfig
	// 重试配置
	MaxRetries    int
	RetryInterval time.Duration
	// 死信队列
	DeadLetterTopic string
	// 批量大小
	BatchSize int
	// 超时
	DispatchTimeout time.Duration
}

// RouteConfig 路由配置
type RouteConfig struct {
	EventType   string
	Destination string
	Method      string
	Headers     map[string]string
}

// WebSocketConfig WebSocket 配置
type WebSocketConfig struct {
	Enabled           bool
	MaxConnections    int
	PingInterval      time.Duration
	PongTimeout       time.Duration
	WriteBufferSize   int
	ReadBufferSize    int
	MessageBufferSize int
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
			Port:         getEnvInt("SERVER_PORT", 8082),
			ReadTimeout:  getEnvDuration("SERVER_READ_TIMEOUT", 5*time.Second),
			WriteTimeout: getEnvDuration("SERVER_WRITE_TIMEOUT", 10*time.Second),
		},
		Kafka: KafkaConfig{
			Brokers:        getEnvSlice("KAFKA_BROKERS", []string{"localhost:9092"}),
			Topics:         getEnvSlice("KAFKA_TOPICS", []string{"fault-events", "alert-events", "system-events"}),
			GroupID:        getEnv("KAFKA_GROUP_ID", "event-dispatcher"),
			MinBytes:       getEnvInt("KAFKA_MIN_BYTES", 1024),
			MaxBytes:       getEnvInt("KAFKA_MAX_BYTES", 10*1024*1024),
			MaxWait:        getEnvDuration("KAFKA_MAX_WAIT", 50*time.Millisecond),
			CommitInterval: getEnvDuration("KAFKA_COMMIT_INTERVAL", 500*time.Millisecond),
		},
		Redis: RedisConfig{
			Addr:          getEnv("REDIS_ADDR", "localhost:6379"),
			Password:      getEnv("REDIS_PASSWORD", ""),
			DB:            getEnvInt("REDIS_DB", 0),
			PoolSize:      getEnvInt("REDIS_POOL_SIZE", 200),
			MinIdleConns:  getEnvInt("REDIS_MIN_IDLE_CONNS", 20),
			PubSubChannel: getEnv("REDIS_PUBSUB_CHANNEL", "events"),
		},
		Dispatcher: DispatcherConfig{
			Routes:          []RouteConfig{},
			MaxRetries:      getEnvInt("DISPATCH_MAX_RETRIES", 3),
			RetryInterval:   getEnvDuration("DISPATCH_RETRY_INTERVAL", 100*time.Millisecond),
			DeadLetterTopic: getEnv("DEAD_LETTER_TOPIC", "dead-letter"),
			BatchSize:       getEnvInt("DISPATCH_BATCH_SIZE", 100),
			DispatchTimeout: getEnvDuration("DISPATCH_TIMEOUT", 5*time.Second),
		},
		WebSocket: WebSocketConfig{
			Enabled:           getEnvBool("WEBSOCKET_ENABLED", true),
			MaxConnections:    getEnvInt("WEBSOCKET_MAX_CONNECTIONS", 10000),
			PingInterval:      getEnvDuration("WEBSOCKET_PING_INTERVAL", 30*time.Second),
			PongTimeout:       getEnvDuration("WEBSOCKET_PONG_TIMEOUT", 10*time.Second),
			WriteBufferSize:   getEnvInt("WEBSOCKET_WRITE_BUFFER", 4096),
			ReadBufferSize:    getEnvInt("WEBSOCKET_READ_BUFFER", 4096),
			MessageBufferSize: getEnvInt("WEBSOCKET_MESSAGE_BUFFER", 256),
		},
		Performance: PerformanceConfig{
			Workers:       getEnvInt("WORKERS", 32),
			BufferSize:    getEnvInt("BUFFER_SIZE", 200000),
			BatchSize:     getEnvInt("BATCH_SIZE", 1000),
			FlushInterval: getEnvDuration("FLUSH_INTERVAL", 50*time.Millisecond),
			MaxConcurrent: getEnvInt("MAX_CONCURRENT", 20000),
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

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolValue, err := strconv.ParseBool(value); err == nil {
			return boolValue
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
