-- ============================================================
-- 007-phase3-seed-data.sql
-- Phase 3 种子数据：仿真场景模板 + 物理方程
-- ============================================================
SET NAMES utf8mb4;

-- ============================================================
-- 1. 预置 6 个仿真场景模板（提案 5.7）
-- ============================================================
INSERT INTO `simulation_scenarios` (`machine_id`, `name`, `description`, `scenario_type`, `parameter_overrides`, `horizon_steps`, `step_interval_sec`, `enable_monte_carlo`, `monte_carlo_runs`, `method`, `status`, `version`, `created_by`)
VALUES
  ('EQ-SGT800-001', '满载过载测试', '模拟设备在额定功率120%条件下持续运行30分钟的应力响应', 'overload', '{"loadFactor": 1.2, "duration": 1800}', 30, 60, TRUE, 50, 'sobol_qmc', 'draft', 1, 'system'),
  ('EQ-SGT800-001', '高温热应力测试', '模拟环境温度45°C条件下的热传导和材料膨胀效应', 'thermal', '{"ambientTemp": 45, "solarRadiation": 800}', 60, 30, TRUE, 100, 'sobol_qmc', 'draft', 1, 'system'),
  ('EQ-ZR500-002', '加速退化模拟', '模拟压缩机在恶劣工况下的加速老化过程', 'degradation', '{"agingFactor": 2.5, "contaminationLevel": 0.8}', 90, 60, TRUE, 50, 'sobol_qmc', 'draft', 1, 'system'),
  ('EQ-SGT800-001', '共振频率分析', '扫频分析设备在不同转速下的共振响应', 'resonance', '{"freqStart": 10, "freqEnd": 200, "sweepRate": 1}', 45, 20, FALSE, 0, 'sobol_qmc', 'draft', 1, 'system'),
  ('EQ-CR95-003', '台风工况模拟', '模拟12级台风条件下的风载力矩和倾覆安全系数', 'typhoon', '{"windSpeed": 35, "gustFactor": 1.4, "waveHeight": 8}', 30, 60, TRUE, 200, 'sobol_qmc', 'draft', 1, 'system'),
  ('EQ-AXF2000-004', '多因素耦合分析', '同时考虑高温、高湿、振动耦合效应的综合评估', 'multi_factor', '{"ambientTemp": 42, "humidity": 0.95, "vibrationAmplitude": 2.5}', 60, 30, TRUE, 100, 'sobol_qmc', 'draft', 1, 'system');

-- ============================================================
-- 2. 物理方程种子数据（diagnosis_physics_formulas 表）
-- ============================================================
INSERT IGNORE INTO `diagnosis_physics_formulas` (`name`, `formula`, `description`, `category`, `variables`, `unit`, `applicable_types`, `created_at`)
VALUES
  ('风载力矩', 'M_{wind} = \\frac{1}{2} \\rho v^2 \\cdot A \\cdot \\frac{h}{2}', '计算风力对结构产生的弯矩', 'structural', '{"rho": "空气密度 (kg/m³)", "v": "风速 (m/s)", "A": "迎风面积 (m²)", "h": "结构高度 (m)"}', 'N·m', '["rotating_machinery", "pump", "fan"]', NOW()),
  ('疲劳应力增量', '\\Delta\\sigma = k \\times \\frac{M}{W}', '计算循环载荷下的疲劳应力增量', 'fatigue', '{"k": "应力集中系数", "M": "弯矩 (N·m)", "W": "截面模量 (m³)"}', 'MPa', '["rotating_machinery", "compressor", "motor"]', NOW()),
  ('S-N曲线寿命', 'N = \\frac{C}{(\\Delta\\sigma)^m}', '基于S-N曲线估算疲劳寿命', 'fatigue', '{"C": "材料常数", "m": "S-N曲线斜率", "delta_sigma": "应力幅值 (MPa)"}', 'cycles', '["rotating_machinery", "compressor", "pump", "motor"]', NOW()),
  ('腐蚀速率', 'r = k \\cdot [Cl^-] \\cdot [humidity]', '计算氯离子和湿度条件下的腐蚀速率', 'corrosion', '{"k": "腐蚀系数", "Cl": "氯离子浓度 (ppm)", "humidity": "相对湿度 (0-1)"}', 'mm/year', '["rotating_machinery", "pump", "fan"]', NOW()),
  ('倾覆安全系数', 'K = \\frac{M_{stab}}{M_{overturn}}', '计算结构抗倾覆安全系数', 'structural', '{"M_stab": "稳定力矩 (N·m)", "M_overturn": "倾覆力矩 (N·m)"}', '无量纲', '["rotating_machinery", "fan"]', NOW()),
  ('热传导简化模型', 'T(x,t) = T_0 + \\Delta T \\cdot \\text{erfc}\\left(\\frac{x}{2\\sqrt{\\alpha t}}\\right)', '一维半无限体热传导温度分布', 'thermal', '{"T0": "初始温度 (°C)", "deltaT": "表面温升 (°C)", "x": "深度 (m)", "alpha": "热扩散系数 (m²/s)", "t": "时间 (s)"}', '°C', '["rotating_machinery", "compressor", "motor"]', NOW()),
  ('振动预测模型', 'a = A \\cdot e^{\\beta t} \\cdot \\sin(2\\pi f t + \\phi)', '指数增长型振动幅值预测', 'vibration', '{"A": "初始振幅 (mm/s²)", "beta": "增长率 (1/s)", "f": "主频 (Hz)", "phi": "初相位 (rad)", "t": "时间 (s)"}', 'mm/s²', '["rotating_machinery", "compressor", "pump", "motor", "fan"]', NOW());

-- ============================================================
-- 验证
-- ============================================================
SELECT '仿真场景模板数' AS info, COUNT(*) AS cnt FROM simulation_scenarios WHERE created_by = 'system';
SELECT '物理方程数' AS info, COUNT(*) AS cnt FROM diagnosis_physics_formulas;
