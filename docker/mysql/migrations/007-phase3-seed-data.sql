-- ============================================================
-- 007-phase3-seed-data.sql
-- Phase 3 种子数据：仿真场景模板 + 物理方程
-- 幂等：使用 INSERT IGNORE 避免重复插入
-- ============================================================
SET NAMES utf8mb4;

-- ============================================================
-- 1. 预置 6 个仿真场景模板（提案 5.7）
-- ============================================================
INSERT IGNORE INTO `simulation_scenarios` (`machine_id`, `name`, `description`, `scenario_type`, `parameter_overrides`, `horizon_steps`, `step_interval_sec`, `enable_monte_carlo`, `monte_carlo_runs`, `method`, `status`, `version`, `created_by`)
VALUES
  ('EQ-SGT800-001', '满载过载测试', '模拟设备在额定功率120%条件下持续运行30分钟的应力响应', 'overload', '{"loadFactor": 1.2, "duration": 1800}', 30, 60, TRUE, 50, 'sobol_qmc', 'draft', 1, 'system'),
  ('EQ-SGT800-001', '高温热应力测试', '模拟环境温度45°C条件下的热传导和材料膨胀效应', 'thermal', '{"ambientTemp": 45, "solarRadiation": 800}', 60, 30, TRUE, 100, 'sobol_qmc', 'draft', 1, 'system'),
  ('EQ-ZR500-002', '加速退化模拟', '模拟压缩机在恶劣工况下的加速老化过程', 'degradation', '{"agingFactor": 2.5, "contaminationLevel": 0.8}', 90, 60, TRUE, 50, 'sobol_qmc', 'draft', 1, 'system'),
  ('EQ-SGT800-001', '共振频率分析', '扫频分析设备在不同转速下的共振响应', 'resonance', '{"freqStart": 10, "freqEnd": 200, "sweepRate": 1}', 45, 20, FALSE, 0, 'sobol_qmc', 'draft', 1, 'system'),
  ('EQ-CR95-003', '台风工况模拟', '模拟12级台风条件下的风载力矩和倾覆安全系数', 'typhoon', '{"windSpeed": 35, "gustFactor": 1.4, "waveHeight": 8}', 30, 60, TRUE, 200, 'sobol_qmc', 'draft', 1, 'system'),
  ('EQ-AXF2000-004', '多因素耦合分析', '同时考虑高温、高湿、振动耦合效应的综合评估', 'multi_factor', '{"ambientTemp": 42, "humidity": 0.95, "vibrationAmplitude": 2.5}', 60, 30, TRUE, 100, 'sobol_qmc', 'draft', 1, 'system');

-- ============================================================
-- 2. 物理方程种子数据（diagnosis_physics_formulas 表）
--    字段对齐 02-v5-ddl.sql 中的表结构：
--    name, category, formula, variables, applicable_equipment, source, reference, version, enabled
-- ============================================================
INSERT IGNORE INTO `diagnosis_physics_formulas`
  (`name`, `category`, `formula`, `variables`, `applicable_equipment`, `source`, `reference`, `version`, `enabled`)
VALUES
  ('风载力矩',
   'wind_load',
   'M_{wind} = \\frac{1}{2} \\rho v^2 \\cdot A \\cdot \\frac{h}{2}',
   '{"rho": {"label": "空气密度", "unit": "kg/m³", "default": 1.225}, "v": {"label": "风速", "unit": "m/s"}, "A": {"label": "迎风面积", "unit": "m²"}, "h": {"label": "结构高度", "unit": "m"}}',
   '["rotating_machinery", "pump", "fan"]',
   'physics',
   'GB 50009-2012 建筑结构荷载规范',
   '1.0.0', TRUE),

  ('疲劳应力增量',
   'fatigue',
   '\\Delta\\sigma = k \\times \\frac{M}{W}',
   '{"k": {"label": "应力集中系数", "unit": ""}, "M": {"label": "弯矩", "unit": "N·m"}, "W": {"label": "截面模量", "unit": "m³"}}',
   '["rotating_machinery", "compressor", "motor"]',
   'physics',
   'Peterson''s Stress Concentration Factors, 4th Ed.',
   '1.0.0', TRUE),

  ('S-N曲线寿命',
   'fatigue',
   'N = \\frac{C}{(\\Delta\\sigma)^m}',
   '{"C": {"label": "材料常数", "unit": ""}, "m": {"label": "S-N曲线斜率", "unit": ""}, "delta_sigma": {"label": "应力幅值", "unit": "MPa"}}',
   '["rotating_machinery", "compressor", "pump", "motor"]',
   'physics',
   'ASTM E739 Standard Practice for Statistical Analysis of Linear or Linearized S-N Data',
   '1.0.0', TRUE),

  ('腐蚀速率',
   'corrosion',
   'r = k \\cdot [Cl^-] \\cdot [humidity]',
   '{"k": {"label": "腐蚀系数", "unit": ""}, "Cl": {"label": "氯离子浓度", "unit": "ppm"}, "humidity": {"label": "相对湿度", "unit": "0-1"}}',
   '["rotating_machinery", "pump", "fan"]',
   'physics',
   'ISO 9223:2012 Corrosion of metals and alloys',
   '1.0.0', TRUE),

  ('倾覆安全系数',
   'structural',
   'K = \\frac{M_{stab}}{M_{overturn}}',
   '{"M_stab": {"label": "稳定力矩", "unit": "N·m"}, "M_overturn": {"label": "倾覆力矩", "unit": "N·m"}}',
   '["rotating_machinery", "fan"]',
   'physics',
   'GB 50007-2011 建筑地基基础设计规范',
   '1.0.0', TRUE),

  ('热传导简化模型',
   'thermal',
   'T(x,t) = T_0 + \\Delta T \\cdot erfc(x / (2 * sqrt(alpha * t)))',
   '{"T0": {"label": "初始温度", "unit": "°C"}, "deltaT": {"label": "表面温升", "unit": "°C"}, "x": {"label": "深度", "unit": "m"}, "alpha": {"label": "热扩散系数", "unit": "m²/s"}, "t": {"label": "时间", "unit": "s"}}',
   '["rotating_machinery", "compressor", "motor"]',
   'physics',
   'Incropera, Fundamentals of Heat and Mass Transfer, 8th Ed.',
   '1.0.0', TRUE),

  ('振动预测模型',
   'vibration',
   'a = A * exp(beta * t) * sin(2 * pi * f * t + phi)',
   '{"A": {"label": "初始振幅", "unit": "mm/s²"}, "beta": {"label": "增长率", "unit": "1/s"}, "f": {"label": "主频", "unit": "Hz"}, "phi": {"label": "初相位", "unit": "rad"}, "t": {"label": "时间", "unit": "s"}}',
   '["rotating_machinery", "compressor", "pump", "motor", "fan"]',
   'physics',
   'ISO 10816 Mechanical vibration evaluation',
   '1.0.0', TRUE);

-- ============================================================
-- 验证
-- ============================================================
SELECT '仿真场景模板数' AS info, COUNT(*) AS cnt FROM simulation_scenarios WHERE created_by = 'system';
SELECT '物理方程数' AS info, COUNT(*) AS cnt FROM diagnosis_physics_formulas;
