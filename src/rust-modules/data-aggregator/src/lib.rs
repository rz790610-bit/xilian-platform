//! 西联智能平台 - 高性能数据聚合模块
//!
//! 本模块提供高性能的数据聚合功能，用于港口设备传感器数据的实时统计和分析。
//!
//! # 功能特性
//!
//! - **时间窗口聚合**: 支持滑动窗口和滚动窗口
//! - **多维度聚合**: 按设备、传感器、时间等维度聚合
//! - **实时统计**: 均值、方差、百分位数等
//! - **增量计算**: 支持增量更新，避免重复计算
//! - **并行处理**: 利用多核 CPU 进行并行聚合
//! - **内存高效**: 使用流式算法，控制内存使用
//!
//! # 示例
//!
//! ```rust
//! use data_aggregator::{TimeWindowAggregator, AggregationType, WindowConfig};
//!
//! let config = WindowConfig::sliding(60_000, 10_000); // 60秒窗口，10秒滑动
//! let mut aggregator = TimeWindowAggregator::new(config);
//! aggregator.add_value(1000, 25.5);
//! let result = aggregator.get_current_aggregate();
//! ```

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, VecDeque};
use std::sync::Arc;
use thiserror::Error;

// ============================================
// 错误类型
// ============================================

/// 聚合错误
#[derive(Error, Debug)]
pub enum AggregatorError {
    #[error("无效的窗口配置: {0}")]
    InvalidWindowConfig(String),

    #[error("数据点时间戳无效: {0}")]
    InvalidTimestamp(i64),

    #[error("聚合类型不支持: {0}")]
    UnsupportedAggregation(String),

    #[error("计算错误: {0}")]
    ComputationError(String),
}

pub type Result<T> = std::result::Result<T, AggregatorError>;

// ============================================
// 核心类型定义
// ============================================

/// 数据点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataPoint {
    pub timestamp: i64,
    pub value: f64,
    pub tags: HashMap<String, String>,
}

impl DataPoint {
    pub fn new(timestamp: i64, value: f64) -> Self {
        Self {
            timestamp,
            value,
            tags: HashMap::new(),
        }
    }

    pub fn with_tag(mut self, key: &str, value: &str) -> Self {
        self.tags.insert(key.to_string(), value.to_string());
        self
    }
}

/// 聚合类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AggregationType {
    Count,
    Sum,
    Mean,
    Min,
    Max,
    First,
    Last,
    Variance,
    StdDev,
    Median,
    Percentile(u8), // 0-100
    Range,
    Rate,
}

/// 窗口类型
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum WindowType {
    /// 滚动窗口（固定大小，不重叠）
    Tumbling,
    /// 滑动窗口（固定大小，可重叠）
    Sliding,
    /// 会话窗口（基于活动间隔）
    Session,
}

/// 窗口配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowConfig {
    pub window_type: WindowType,
    pub window_size_ms: i64,
    pub slide_size_ms: Option<i64>,
    pub session_gap_ms: Option<i64>,
    pub max_window_count: usize,
}

impl WindowConfig {
    /// 创建滚动窗口配置
    pub fn tumbling(window_size_ms: i64) -> Self {
        Self {
            window_type: WindowType::Tumbling,
            window_size_ms,
            slide_size_ms: None,
            session_gap_ms: None,
            max_window_count: 1000,
        }
    }

    /// 创建滑动窗口配置
    pub fn sliding(window_size_ms: i64, slide_size_ms: i64) -> Self {
        Self {
            window_type: WindowType::Sliding,
            window_size_ms,
            slide_size_ms: Some(slide_size_ms),
            session_gap_ms: None,
            max_window_count: 1000,
        }
    }

    /// 创建会话窗口配置
    pub fn session(session_gap_ms: i64) -> Self {
        Self {
            window_type: WindowType::Session,
            window_size_ms: 0,
            slide_size_ms: None,
            session_gap_ms: Some(session_gap_ms),
            max_window_count: 1000,
        }
    }
}

/// 聚合结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AggregateResult {
    pub window_start: i64,
    pub window_end: i64,
    pub count: usize,
    pub sum: f64,
    pub mean: f64,
    pub min: f64,
    pub max: f64,
    pub variance: f64,
    pub std_dev: f64,
    pub first: Option<f64>,
    pub last: Option<f64>,
    pub percentiles: HashMap<u8, f64>,
}

impl Default for AggregateResult {
    fn default() -> Self {
        Self {
            window_start: 0,
            window_end: 0,
            count: 0,
            sum: 0.0,
            mean: 0.0,
            min: f64::INFINITY,
            max: f64::NEG_INFINITY,
            variance: 0.0,
            std_dev: 0.0,
            first: None,
            last: None,
            percentiles: HashMap::new(),
        }
    }
}

// ============================================
// 增量统计计算器
// ============================================

/// Welford 在线算法 - 用于增量计算均值和方差
#[derive(Debug, Clone, Default)]
pub struct WelfordAccumulator {
    count: usize,
    mean: f64,
    m2: f64,
    min: f64,
    max: f64,
    sum: f64,
    first: Option<f64>,
    last: Option<f64>,
}

impl WelfordAccumulator {
    pub fn new() -> Self {
        Self {
            count: 0,
            mean: 0.0,
            m2: 0.0,
            min: f64::INFINITY,
            max: f64::NEG_INFINITY,
            sum: 0.0,
            first: None,
            last: None,
        }
    }

    /// 添加新值
    pub fn add(&mut self, value: f64) {
        self.count += 1;
        let delta = value - self.mean;
        self.mean += delta / self.count as f64;
        let delta2 = value - self.mean;
        self.m2 += delta * delta2;

        self.sum += value;
        self.min = self.min.min(value);
        self.max = self.max.max(value);

        if self.first.is_none() {
            self.first = Some(value);
        }
        self.last = Some(value);
    }

    /// 移除旧值（用于滑动窗口）
    pub fn remove(&mut self, value: f64) {
        if self.count == 0 {
            return;
        }

        self.count -= 1;
        self.sum -= value;

        if self.count == 0 {
            self.mean = 0.0;
            self.m2 = 0.0;
            self.min = f64::INFINITY;
            self.max = f64::NEG_INFINITY;
        } else {
            let delta = value - self.mean;
            self.mean -= delta / self.count as f64;
            let delta2 = value - self.mean;
            self.m2 -= delta * delta2;
        }
    }

    /// 合并两个累加器
    pub fn merge(&mut self, other: &WelfordAccumulator) {
        if other.count == 0 {
            return;
        }

        let combined_count = self.count + other.count;
        let delta = other.mean - self.mean;

        self.mean = (self.count as f64 * self.mean + other.count as f64 * other.mean)
            / combined_count as f64;
        self.m2 = self.m2
            + other.m2
            + delta * delta * (self.count as f64 * other.count as f64) / combined_count as f64;

        self.count = combined_count;
        self.sum += other.sum;
        self.min = self.min.min(other.min);
        self.max = self.max.max(other.max);

        if self.first.is_none() {
            self.first = other.first;
        }
        self.last = other.last.or(self.last);
    }

    /// 获取统计结果
    pub fn get_result(&self) -> AggregateResult {
        let variance = if self.count > 1 {
            self.m2 / (self.count - 1) as f64
        } else {
            0.0
        };

        AggregateResult {
            window_start: 0,
            window_end: 0,
            count: self.count,
            sum: self.sum,
            mean: self.mean,
            min: if self.min == f64::INFINITY { 0.0 } else { self.min },
            max: if self.max == f64::NEG_INFINITY { 0.0 } else { self.max },
            variance,
            std_dev: variance.sqrt(),
            first: self.first,
            last: self.last,
            percentiles: HashMap::new(),
        }
    }

    /// 获取计数
    pub fn count(&self) -> usize {
        self.count
    }

    /// 获取均值
    pub fn mean(&self) -> f64 {
        self.mean
    }

    /// 获取方差
    pub fn variance(&self) -> f64 {
        if self.count > 1 {
            self.m2 / (self.count - 1) as f64
        } else {
            0.0
        }
    }
}

// ============================================
// 时间窗口聚合器
// ============================================

/// 时间窗口聚合器
pub struct TimeWindowAggregator {
    config: WindowConfig,
    windows: BTreeMap<i64, WindowState>,
    current_window_start: i64,
}

/// 窗口状态
struct WindowState {
    accumulator: WelfordAccumulator,
    values: VecDeque<(i64, f64)>,
    start_time: i64,
    end_time: i64,
}

impl TimeWindowAggregator {
    /// 创建新的时间窗口聚合器
    pub fn new(config: WindowConfig) -> Self {
        Self {
            config,
            windows: BTreeMap::new(),
            current_window_start: 0,
        }
    }

    /// 添加数据点
    pub fn add_value(&mut self, timestamp: i64, value: f64) {
        let window_start = self.get_window_start(timestamp);

        // 初始化当前窗口
        if self.current_window_start == 0 {
            self.current_window_start = window_start;
        }

        // 获取或创建窗口
        let window = self.windows.entry(window_start).or_insert_with(|| WindowState {
            accumulator: WelfordAccumulator::new(),
            values: VecDeque::new(),
            start_time: window_start,
            end_time: window_start + self.config.window_size_ms,
        });

        // 添加值
        window.accumulator.add(value);
        window.values.push_back((timestamp, value));

        // 清理过期窗口
        self.cleanup_old_windows(timestamp);
    }

    /// 获取窗口起始时间
    fn get_window_start(&self, timestamp: i64) -> i64 {
        match self.config.window_type {
            WindowType::Tumbling => {
                (timestamp / self.config.window_size_ms) * self.config.window_size_ms
            }
            WindowType::Sliding => {
                let slide = self.config.slide_size_ms.unwrap_or(self.config.window_size_ms);
                (timestamp / slide) * slide
            }
            WindowType::Session => {
                // 会话窗口需要特殊处理
                self.current_window_start
            }
        }
    }

    /// 清理过期窗口
    fn cleanup_old_windows(&mut self, current_time: i64) {
        let max_age = self.config.window_size_ms * self.config.max_window_count as i64;
        let cutoff = current_time - max_age;

        self.windows.retain(|&start, _| start >= cutoff);
    }

    /// 获取当前窗口的聚合结果
    pub fn get_current_aggregate(&self) -> Option<AggregateResult> {
        self.windows.values().last().map(|w| {
            let mut result = w.accumulator.get_result();
            result.window_start = w.start_time;
            result.window_end = w.end_time;
            result
        })
    }

    /// 获取所有窗口的聚合结果
    pub fn get_all_aggregates(&self) -> Vec<AggregateResult> {
        self.windows
            .values()
            .map(|w| {
                let mut result = w.accumulator.get_result();
                result.window_start = w.start_time;
                result.window_end = w.end_time;
                result
            })
            .collect()
    }

    /// 获取指定时间范围内的聚合结果
    pub fn get_aggregates_in_range(&self, start: i64, end: i64) -> Vec<AggregateResult> {
        self.windows
            .range(start..end)
            .map(|(_, w)| {
                let mut result = w.accumulator.get_result();
                result.window_start = w.start_time;
                result.window_end = w.end_time;
                result
            })
            .collect()
    }

    /// 重置聚合器
    pub fn reset(&mut self) {
        self.windows.clear();
        self.current_window_start = 0;
    }
}

// ============================================
// 多维度聚合器
// ============================================

/// 维度键
#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, Deserialize)]
pub struct DimensionKey {
    pub dimensions: Vec<(String, String)>,
}

impl DimensionKey {
    pub fn new() -> Self {
        Self {
            dimensions: Vec::new(),
        }
    }

    pub fn with_dimension(mut self, key: &str, value: &str) -> Self {
        self.dimensions.push((key.to_string(), value.to_string()));
        self.dimensions.sort_by(|a, b| a.0.cmp(&b.0));
        self
    }

    pub fn from_tags(tags: &HashMap<String, String>) -> Self {
        let mut dimensions: Vec<_> = tags
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        dimensions.sort_by(|a, b| a.0.cmp(&b.0));
        Self { dimensions }
    }
}

impl Default for DimensionKey {
    fn default() -> Self {
        Self::new()
    }
}

/// 多维度聚合器
pub struct MultiDimensionAggregator {
    config: WindowConfig,
    aggregators: DashMap<DimensionKey, Arc<RwLock<TimeWindowAggregator>>>,
}

impl MultiDimensionAggregator {
    /// 创建新的多维度聚合器
    pub fn new(config: WindowConfig) -> Self {
        Self {
            config,
            aggregators: DashMap::new(),
        }
    }

    /// 添加数据点
    pub fn add_point(&self, point: &DataPoint) {
        let key = DimensionKey::from_tags(&point.tags);

        let aggregator = self
            .aggregators
            .entry(key)
            .or_insert_with(|| Arc::new(RwLock::new(TimeWindowAggregator::new(self.config.clone()))));

        aggregator.write().add_value(point.timestamp, point.value);
    }

    /// 批量添加数据点
    pub fn add_points(&self, points: &[DataPoint]) {
        use rayon::prelude::*;

        points.par_iter().for_each(|point| {
            self.add_point(point);
        });
    }

    /// 获取指定维度的聚合结果
    pub fn get_aggregate(&self, key: &DimensionKey) -> Option<AggregateResult> {
        self.aggregators
            .get(key)
            .and_then(|agg| agg.read().get_current_aggregate())
    }

    /// 获取所有维度的聚合结果
    pub fn get_all_aggregates(&self) -> HashMap<DimensionKey, Vec<AggregateResult>> {
        self.aggregators
            .iter()
            .map(|entry| (entry.key().clone(), entry.value().read().get_all_aggregates()))
            .collect()
    }

    /// 获取维度列表
    pub fn get_dimensions(&self) -> Vec<DimensionKey> {
        self.aggregators.iter().map(|e| e.key().clone()).collect()
    }

    /// 重置所有聚合器
    pub fn reset(&self) {
        self.aggregators.clear();
    }
}

// ============================================
// 流式聚合器
// ============================================

/// 流式聚合器 - 用于实时数据流处理
pub struct StreamAggregator {
    window_size_ms: i64,
    slide_size_ms: i64,
    buffer: VecDeque<(i64, f64)>,
    accumulator: WelfordAccumulator,
    last_emit_time: i64,
}

impl StreamAggregator {
    /// 创建新的流式聚合器
    pub fn new(window_size_ms: i64, slide_size_ms: i64) -> Self {
        Self {
            window_size_ms,
            slide_size_ms,
            buffer: VecDeque::new(),
            accumulator: WelfordAccumulator::new(),
            last_emit_time: 0,
        }
    }

    /// 处理新数据点
    pub fn process(&mut self, timestamp: i64, value: f64) -> Option<AggregateResult> {
        // 添加新值
        self.buffer.push_back((timestamp, value));
        self.accumulator.add(value);

        // 移除过期数据
        let cutoff = timestamp - self.window_size_ms;
        while let Some(&(ts, val)) = self.buffer.front() {
            if ts < cutoff {
                self.buffer.pop_front();
                self.accumulator.remove(val);
            } else {
                break;
            }
        }

        // 检查是否需要发射结果
        if self.last_emit_time == 0 {
            self.last_emit_time = timestamp;
        }

        if timestamp - self.last_emit_time >= self.slide_size_ms {
            self.last_emit_time = timestamp;
            let mut result = self.accumulator.get_result();
            result.window_start = cutoff;
            result.window_end = timestamp;
            Some(result)
        } else {
            None
        }
    }

    /// 强制发射当前结果
    pub fn flush(&mut self) -> AggregateResult {
        let result = self.accumulator.get_result();
        self.buffer.clear();
        self.accumulator = WelfordAccumulator::new();
        result
    }

    /// 获取当前缓冲区大小
    pub fn buffer_size(&self) -> usize {
        self.buffer.len()
    }
}

// ============================================
// 百分位数计算器
// ============================================

/// T-Digest 算法实现 - 用于近似百分位数计算
pub struct TDigest {
    centroids: Vec<(f64, f64)>, // (mean, weight)
    max_centroids: usize,
    total_weight: f64,
}

impl TDigest {
    /// 创建新的 T-Digest
    pub fn new(max_centroids: usize) -> Self {
        Self {
            centroids: Vec::new(),
            max_centroids,
            total_weight: 0.0,
        }
    }

    /// 添加值
    pub fn add(&mut self, value: f64, weight: f64) {
        self.centroids.push((value, weight));
        self.total_weight += weight;

        if self.centroids.len() > self.max_centroids * 2 {
            self.compress();
        }
    }

    /// 压缩质心
    fn compress(&mut self) {
        if self.centroids.is_empty() {
            return;
        }

        self.centroids.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

        let mut new_centroids = Vec::new();
        let mut current_mean = self.centroids[0].0;
        let mut current_weight = self.centroids[0].1;

        for &(mean, weight) in &self.centroids[1..] {
            let combined_weight = current_weight + weight;
            if combined_weight <= self.total_weight / self.max_centroids as f64 {
                current_mean =
                    (current_mean * current_weight + mean * weight) / combined_weight;
                current_weight = combined_weight;
            } else {
                new_centroids.push((current_mean, current_weight));
                current_mean = mean;
                current_weight = weight;
            }
        }
        new_centroids.push((current_mean, current_weight));

        self.centroids = new_centroids;
    }

    /// 计算百分位数
    pub fn percentile(&self, p: f64) -> f64 {
        if self.centroids.is_empty() {
            return 0.0;
        }

        let target_weight = self.total_weight * p / 100.0;
        let mut cumulative_weight = 0.0;

        for &(mean, weight) in &self.centroids {
            cumulative_weight += weight;
            if cumulative_weight >= target_weight {
                return mean;
            }
        }

        self.centroids.last().map(|c| c.0).unwrap_or(0.0)
    }

    /// 合并另一个 T-Digest
    pub fn merge(&mut self, other: &TDigest) {
        for &(mean, weight) in &other.centroids {
            self.add(mean, weight);
        }
    }
}

// ============================================
// 聚合管道
// ============================================

/// 聚合操作
#[derive(Debug, Clone)]
pub enum AggregateOp {
    Filter { predicate: fn(&DataPoint) -> bool },
    Map { transform: fn(&DataPoint) -> DataPoint },
    GroupBy { key_fn: fn(&DataPoint) -> DimensionKey },
    Aggregate { aggregation: AggregationType },
    Window { config: WindowConfig },
}

/// 聚合管道
pub struct AggregationPipeline {
    operations: Vec<AggregateOp>,
}

impl AggregationPipeline {
    pub fn new() -> Self {
        Self {
            operations: Vec::new(),
        }
    }

    pub fn filter(mut self, predicate: fn(&DataPoint) -> bool) -> Self {
        self.operations.push(AggregateOp::Filter { predicate });
        self
    }

    pub fn map(mut self, transform: fn(&DataPoint) -> DataPoint) -> Self {
        self.operations.push(AggregateOp::Map { transform });
        self
    }

    pub fn group_by(mut self, key_fn: fn(&DataPoint) -> DimensionKey) -> Self {
        self.operations.push(AggregateOp::GroupBy { key_fn });
        self
    }

    pub fn aggregate(mut self, aggregation: AggregationType) -> Self {
        self.operations.push(AggregateOp::Aggregate { aggregation });
        self
    }

    pub fn window(mut self, config: WindowConfig) -> Self {
        self.operations.push(AggregateOp::Window { config });
        self
    }

    /// 执行管道
    pub fn execute(&self, points: Vec<DataPoint>) -> Vec<AggregateResult> {
        let mut current_points = points;
        let mut results = Vec::new();

        for op in &self.operations {
            match op {
                AggregateOp::Filter { predicate } => {
                    current_points = current_points.into_iter().filter(predicate).collect();
                }
                AggregateOp::Map { transform } => {
                    current_points = current_points.iter().map(transform).collect();
                }
                AggregateOp::GroupBy { key_fn: _ } => {
                    // 分组逻辑
                }
                AggregateOp::Aggregate { aggregation: _ } => {
                    // 聚合逻辑
                    let mut acc = WelfordAccumulator::new();
                    for point in &current_points {
                        acc.add(point.value);
                    }
                    results.push(acc.get_result());
                }
                AggregateOp::Window { config } => {
                    let mut agg = TimeWindowAggregator::new(config.clone());
                    for point in &current_points {
                        agg.add_value(point.timestamp, point.value);
                    }
                    results = agg.get_all_aggregates();
                }
            }
        }

        results
    }
}

impl Default for AggregationPipeline {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================
// 测试
// ============================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_welford_accumulator() {
        let mut acc = WelfordAccumulator::new();
        acc.add(1.0);
        acc.add(2.0);
        acc.add(3.0);
        acc.add(4.0);
        acc.add(5.0);

        assert_eq!(acc.count(), 5);
        assert!((acc.mean() - 3.0).abs() < 1e-10);
        assert!((acc.variance() - 2.5).abs() < 1e-10);
    }

    #[test]
    fn test_time_window_aggregator() {
        let config = WindowConfig::tumbling(1000);
        let mut agg = TimeWindowAggregator::new(config);

        agg.add_value(100, 1.0);
        agg.add_value(200, 2.0);
        agg.add_value(300, 3.0);

        let result = agg.get_current_aggregate();
        assert!(result.is_some());
        let result = result.unwrap();
        assert_eq!(result.count, 3);
        assert!((result.mean - 2.0).abs() < 1e-10);
    }

    #[test]
    fn test_stream_aggregator() {
        let mut agg = StreamAggregator::new(1000, 500);

        // 添加数据点
        for i in 0..10 {
            let timestamp = i * 100;
            let value = i as f64;
            let _ = agg.process(timestamp, value);
        }

        assert!(agg.buffer_size() > 0);
    }

    #[test]
    fn test_dimension_key() {
        let key1 = DimensionKey::new()
            .with_dimension("device", "agv_001")
            .with_dimension("sensor", "temp");

        let key2 = DimensionKey::new()
            .with_dimension("sensor", "temp")
            .with_dimension("device", "agv_001");

        assert_eq!(key1, key2);
    }

    #[test]
    fn test_tdigest() {
        let mut td = TDigest::new(100);

        for i in 1..=100 {
            td.add(i as f64, 1.0);
        }

        let p50 = td.percentile(50.0);
        assert!((p50 - 50.0).abs() < 5.0);

        let p90 = td.percentile(90.0);
        assert!((p90 - 90.0).abs() < 5.0);
    }

    #[test]
    fn test_multi_dimension_aggregator() {
        let config = WindowConfig::tumbling(1000);
        let agg = MultiDimensionAggregator::new(config);

        let point1 = DataPoint::new(100, 1.0).with_tag("device", "agv_001");
        let point2 = DataPoint::new(200, 2.0).with_tag("device", "agv_001");
        let point3 = DataPoint::new(300, 3.0).with_tag("device", "agv_002");

        agg.add_point(&point1);
        agg.add_point(&point2);
        agg.add_point(&point3);

        let dimensions = agg.get_dimensions();
        assert_eq!(dimensions.len(), 2);
    }
}
