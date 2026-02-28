#!/usr/bin/env python3
"""
CAD 图纸知识化处理流水线
========================
从 GJM12-03 小车总成 DWG 图纸目录提取零部件清单、装配树、
传感器映射和 Neo4j Cypher 初始化语句。

5 步处理流程:
  Step 1: 扫描目录，收集 DWG 文件元数据
  Step 2: 尝试 DXF 增强解析（可选）
  Step 3: 生成 4 段式部件编码
  Step 4: 构建装配树
  Step 5: 传感器映射 + Cypher 输出

用法:
  python3 scripts/cad-knowledge-pipeline.py
  python3 scripts/cad-knowledge-pipeline.py --source /path/to/dwg/dir
"""

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------

DEFAULT_SOURCE = os.path.expanduser(
    "~/Desktop/测试数据/日照项目图纸/修改/GJM12-03小车总成"
)
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_ROOT / "test-data" / "gjm12_knowledge"

# 4 段式编码映射表: 文件名编码前缀 → (system, subsystem, component, part)
# 下划线 "_" 表示该层级由子文件/子目录继承
COMPONENT_CODE_MAP: dict[str, tuple[str, str, str, str]] = {
    # --- 顶层 ---
    "GJM12-03":     ("TROLLEY", "_", "_", "_"),
    # --- 小车架 ---
    "GJM120301":    ("TROLLEY", "FRAME", "MAIN", "_"),
    # --- 小车运行机构 ---
    "GJM120303":    ("TROLLEY", "TRAVEL", "_", "_"),
    "GJM12030301":  ("TROLLEY", "TRAVEL", "WHEEL_ASSY", "SET_01"),
    "GJM12030302":  ("TROLLEY", "TRAVEL", "WHEEL_ASSY", "SET_02"),
    "GJM12030303":  ("TROLLEY", "TRAVEL", "GBX_MOUNT", "_"),
    "GJM12030304":  ("TROLLEY", "TRAVEL", "COUPLING", "_"),
    "GJM12030305":  ("TROLLEY", "TRAVEL", "CONNECTOR", "_"),
    "GJM12030306":  ("TROLLEY", "TRAVEL", "BRAKE_COVER", "_"),
    # --- 起升机构 ---
    "GJM120304":    ("TROLLEY", "HOIST", "_", "_"),
    "GJM12030401":  ("TROLLEY", "HOIST", "JOINT", "_"),
    "GJM12030402":  ("TROLLEY", "HOIST", "DRUM_COUPLING", "_"),
    "GJM12030403":  ("TROLLEY", "HOIST", "END_PLATE_I", "_"),
    "GJM12030404":  ("TROLLEY", "HOIST", "DRUM", "_"),
    "GJM12030405":  ("TROLLEY", "HOIST", "ROPE_CLAMP", "_"),
    "GJM12030406":  ("TROLLEY", "HOIST", "OIL_PAN", "_"),
    "GJM12030407":  ("TROLLEY", "HOIST", "ROPE_GUARD", "_"),
    "GJM12030408":  ("TROLLEY", "HOIST", "BEARING_BASE", "_"),
    "GJM12030409":  ("TROLLEY", "HOIST", "BEARING_SEAT", "_"),
    "GJM12030410":  ("TROLLEY", "HOIST", "LIMIT_DEVICE", "_"),
    "GJM12030411":  ("TROLLEY", "HOIST", "BRAKE_COVER_I", "_"),
    "GJM12030412":  ("TROLLEY", "HOIST", "BASE", "_"),
    "GJM12030413":  ("TROLLEY", "HOIST", "HSS_COUPLING", "_"),
    "GJM12030414":  ("TROLLEY", "HOIST", "BRAKE_COVER_II", "_"),
    "GJM12030415":  ("TROLLEY", "HOIST", "END_PLATE_II", "_"),
    "GJM12030416":  ("TROLLEY", "HOIST", "HSS_BRAKE_COUPLING", "_"),
    "GJM12030417":  ("TROLLEY", "HOIST", "MOTOR_COVER", "_"),
    "GJM12030418":  ("TROLLEY", "HOIST", "WEDGE", "_"),
    "GJM12030419":  ("TROLLEY", "HOIST", "WEDGE_BLOCK", "_"),
    "GJM12030420":  ("TROLLEY", "HOIST", "STOP_BLOCK", "_"),
    "GJM12030421":  ("TROLLEY", "HOIST", "OIL_BAFFLE", "_"),
    "GJM12030422":  ("TROLLEY", "HOIST", "EMERGENCY", "_"),
    # --- 钢丝绳缠绕 ---
    "GJM120305":    ("TROLLEY", "ROPE", "_", "_"),
    "GJM12030501":  ("TROLLEY", "ROPE", "SHEAVE_ASSY", "SET_01"),
    "GJM12030502":  ("TROLLEY", "ROPE", "SHEAVE_ASSY", "SET_02"),
    "GJM12030503":  ("TROLLEY", "ROPE", "SHEAVE_ASSY", "SET_03"),
    "GJM12030504":  ("TROLLEY", "ROPE", "SHEAVE_ASSY", "SET_04"),
    "GJM12030505":  ("TROLLEY", "ROPE", "SHEAVE_ASSY", "SET_05"),
    "GJM12030506":  ("TROLLEY", "ROPE", "ADJ_SCREW", "_"),
    "GJM12030507":  ("TROLLEY", "ROPE", "WEDGE_SOCKET", "_"),
    "GJM12030508":  ("TROLLEY", "ROPE", "PIN", "_"),
    "GJM12030509":  ("TROLLEY", "ROPE", "NUT", "_"),
    # --- 水平轮 ---
    "GJM120306":    ("TROLLEY", "H_WHEEL", "_", "_"),
    "GJM12030601":  ("TROLLEY", "H_WHEEL", "BRACKET", "_"),
    "GJM12030602":  ("TROLLEY", "H_WHEEL", "ROLLER", "_"),
    "GJM12030603":  ("TROLLEY", "H_WHEEL", "WEDGE", "_"),
    "GJM12030604":  ("TROLLEY", "H_WHEEL", "GUARD", "_"),
    # --- 独立件 ---
    "GJM120307":    ("TROLLEY", "ANCHOR", "_", "_"),
    "GJM120308":    ("TROLLEY", "CABLE_FIX", "_", "_"),
    "GJM120309":    ("TROLLEY", "LUBE_BASE", "_", "_"),
    "GJM120310":    ("TROLLEY", "JIB_CRANE", "_", "_"),
}

# ---------------------------------------------------------------------------
# Step 1: 扫描目录
# ---------------------------------------------------------------------------

# 从文件名中提取 GJM 编码的正则
# 匹配 GJM12-03 或 GJM120301 等（数字和连字符组合）
CODE_RE = re.compile(r"(GJM[\d-]+?)(?:R\d+)?(?:\s|[^\dR\-]|$)")

# 更宽松: 提取 GJM 开头到第一个非数字非连字符
CODE_RE_LOOSE = re.compile(r"(GJM12[\d-]*\d)")


def extract_code_from_name(filename: str) -> str:
    """从文件名提取编码（不含扩展名）。"""
    stem = Path(filename).stem
    # 去除日期后缀如 20250113
    # 先尝试严格匹配
    m = CODE_RE_LOOSE.search(stem)
    if m:
        return m.group(1)
    # fallback: 取文件名开头到第一个中文字符或空格
    m2 = re.match(r"(GJM[^\u4e00-\u9fff\s]+)", stem)
    if m2:
        return m2.group(1).rstrip("-")
    return stem


def extract_chinese_name(filename: str, code: str) -> str:
    """从文件名提取中文名称部分。"""
    stem = Path(filename).stem
    # 去掉编码前缀和修订号(R1等)，剩余的中文+符号部分
    # 先去掉 code 前缀
    rest = stem
    if code and code in rest:
        idx = rest.index(code) + len(code)
        rest = rest[idx:]
    # 去掉 R1 等修订号前缀
    rest = re.sub(r"^R\d+\s*", "", rest)
    # 去掉日期后缀
    rest = re.sub(r"\d{8}$", "", rest)
    # 去掉前后空白和特殊字符
    rest = rest.strip(" \t-_")
    return rest if rest else Path(filename).stem


def scan_directory(source_dir: str) -> list[dict[str, Any]]:
    """递归扫描目录，收集所有 DWG 文件元数据。"""
    source = Path(source_dir)
    if not source.exists():
        print(f"[ERROR] 源目录不存在: {source_dir}")
        sys.exit(1)

    files: list[dict[str, Any]] = []

    for dwg in sorted(source.rglob("*.dwg")):
        rel_path = dwg.relative_to(source)
        code = extract_code_from_name(dwg.name)
        name = extract_chinese_name(dwg.name, code)

        # 层级深度 = 目录嵌套层数 (顶层 = 0)
        level = len(rel_path.parts) - 1

        # 父编码: 从所在目录名提取
        parent_code = ""
        if level > 0:
            parent_dir = rel_path.parts[-2]
            parent_code = extract_code_from_name(parent_dir)

        # 是否为总装图: 同名目录和 DWG 存在
        is_assembly = (dwg.parent / dwg.stem).is_dir() or any(
            d.name.startswith(code) for d in dwg.parent.iterdir() if d.is_dir()
        )
        # 更准确的判断: 文件所在目录名的编码与文件编码相同 → 总装图
        parent_dir_code = extract_code_from_name(dwg.parent.name)
        if parent_dir_code == code:
            is_assembly = True

        files.append({
            "fileCode": code,
            "fileName": name,
            "filePath": str(rel_path),
            "fileSize": dwg.stat().st_size,
            "level": level,
            "parentCode": parent_code,
            "isAssembly": is_assembly,
            "dxfData": None,
        })

    return files


# ---------------------------------------------------------------------------
# Step 2: DXF 增强解析（可选）
# ---------------------------------------------------------------------------

def try_dxf_enhancement(files: list[dict], source_dir: str) -> int:
    """尝试用 ezdxf 读取 DWG 文件提取补充信息。返回成功数量。"""
    try:
        import ezdxf
    except ImportError:
        print("[INFO] ezdxf 未安装，跳过 DXF 增强解析")
        return 0

    source = Path(source_dir)
    success_count = 0

    for f in files:
        dwg_path = source / f["filePath"]
        try:
            doc = ezdxf.readfile(str(dwg_path))
            msp = doc.modelspace()

            texts = []
            blocks = []
            layers = list(doc.layers)

            for entity in msp:
                if entity.dxftype() in ("TEXT", "MTEXT"):
                    txt = entity.dxf.text if hasattr(entity.dxf, "text") else ""
                    if txt.strip():
                        texts.append(txt.strip())
                elif entity.dxftype() == "INSERT":
                    blocks.append(entity.dxf.name)

            f["dxfData"] = {
                "texts": texts[:50],  # 限制数量
                "blocks": list(set(blocks))[:30],
                "layers": [l.dxf.name for l in layers][:30],
            }
            success_count += 1
        except Exception:
            # DWG 格式 ezdxf 通常无法直接读取，预期行为
            pass

    return success_count


# ---------------------------------------------------------------------------
# Step 3: 生成 4 段式部件编码
# ---------------------------------------------------------------------------

def normalize_code(code: str) -> str:
    """标准化编码：去除连字符，便于前缀匹配。"""
    return code.replace("-", "")


def assign_component_codes(files: list[dict]) -> None:
    """为每个文件分配 4 段式部件编码。"""
    # 构建标准化映射
    norm_map: dict[str, tuple[str, str, str, str]] = {}
    for k, v in COMPONENT_CODE_MAP.items():
        norm_map[normalize_code(k)] = v

    for f in files:
        norm_code = normalize_code(f["fileCode"])

        # 精确匹配
        if norm_code in norm_map:
            segments = norm_map[norm_code]
            f["componentCode"] = ".".join(s for s in segments if s != "_")
            continue

        # 最长前缀匹配
        best_key = ""
        best_segments = ("TROLLEY", "_", "_", "_")
        for k, v in norm_map.items():
            if norm_code.startswith(k) and len(k) > len(best_key):
                best_key = k
                best_segments = v

        # 构建编码：父段 + 从文件名推导的后缀
        segments_list = [s for s in best_segments if s != "_"]
        suffix = norm_code[len(best_key):] if best_key else ""
        if suffix:
            # 零件级后缀用 PART_XX 编码
            segments_list.append(f"PART_{suffix}")

        f["componentCode"] = ".".join(segments_list) if segments_list else "TROLLEY"


# ---------------------------------------------------------------------------
# Step 4: 构建装配树
# ---------------------------------------------------------------------------

def build_assembly_tree(
    files: list[dict], source_dir: str
) -> dict[str, Any]:
    """基于目录层次构建装配树。"""
    source = Path(source_dir)

    # 构建目录节点映射
    dir_nodes: dict[str, dict] = {}

    def get_dir_node(dir_path: Path) -> dict:
        key = str(dir_path.relative_to(source)) if dir_path != source else "."
        if key in dir_nodes:
            return dir_nodes[key]

        dir_name = dir_path.name
        code = extract_code_from_name(dir_name)
        name = extract_chinese_name(dir_name, code)

        # 查找对应的 componentCode
        norm_code = normalize_code(code)
        norm_map = {normalize_code(k): v for k, v in COMPONENT_CODE_MAP.items()}
        segments = norm_map.get(norm_code, ("TROLLEY", "_", "_", "_"))
        comp_code = ".".join(s for s in segments if s != "_")

        # 查找该目录对应的总装图
        drawing_file = None
        for f in files:
            fpath = source / f["filePath"]
            if fpath.parent == dir_path and f["fileCode"] == code:
                drawing_file = f["filePath"]
                break

        node: dict[str, Any] = {
            "code": code,
            "name": name,
            "componentCode": comp_code or "TROLLEY",
            "drawingFile": drawing_file,
            "children": [],
        }
        dir_nodes[key] = node
        return node

    # 根节点
    root = get_dir_node(source)
    root["code"] = "GJM12-03"
    root["name"] = "小车总成"
    root["componentCode"] = "TROLLEY"

    # 查找根级总装图
    for f in files:
        if f["level"] == 0 and "小车总成" in f["fileName"]:
            root["drawingFile"] = f["filePath"]
            break

    # 遍历所有子目录，构建层级
    for dirpath in sorted(source.rglob("*")):
        if not dirpath.is_dir():
            continue

        node = get_dir_node(dirpath)
        parent_path = dirpath.parent
        if parent_path == source:
            parent_node = root
        else:
            parent_node = get_dir_node(parent_path)

        # 避免重复添加
        if node not in parent_node["children"]:
            parent_node["children"].append(node)

    # 将非总装图的 DWG 文件作为叶子节点
    for f in files:
        fpath = source / f["filePath"]
        parent_dir = fpath.parent

        # 跳过总装图（已作为目录节点的 drawingFile）
        parent_dir_code = extract_code_from_name(parent_dir.name)
        if normalize_code(f["fileCode"]) == normalize_code(parent_dir_code):
            continue

        leaf: dict[str, Any] = {
            "code": f["fileCode"],
            "name": f["fileName"],
            "componentCode": f.get("componentCode", ""),
            "drawingFile": f["filePath"],
            "children": [],
        }

        if parent_dir == source:
            # 顶层散件（非总装图）
            if f.get("fileCode") != root.get("code"):
                root["children"].append(leaf)
        else:
            parent_node = get_dir_node(parent_dir)
            parent_node["children"].append(leaf)

    return root


# ---------------------------------------------------------------------------
# Step 5: 传感器映射
# ---------------------------------------------------------------------------

SENSOR_MAPPINGS = [
    {
        "componentCode": "TROLLEY.HOIST",
        "partCodes": ["GJM120304"],
        "description": "起升机构 → 电机振动",
        "sensors": [
            {"id": "VT-01", "type": "vibration", "position": "hoist motor DE", "sampleRate": 12800},
            {"id": "VT-02", "type": "vibration", "position": "hoist motor NDE", "sampleRate": 12800},
        ],
        "algorithms": ["fft_spectrum", "envelope_demod", "cepstrum"],
    },
    {
        "componentCode": "TROLLEY.HOIST.DRUM",
        "partCodes": ["GJM12030404"],
        "description": "卷筒 → 减速器/卷筒轴承振动",
        "sensors": [
            {"id": "VT-03", "type": "vibration", "position": "hoist gearbox HS", "sampleRate": 12800},
            {"id": "VT-04", "type": "vibration", "position": "hoist gearbox LS", "sampleRate": 12800},
        ],
        "algorithms": ["gear_mesh_analysis", "bearing_defect_frequency"],
    },
    {
        "componentCode": "TROLLEY.HOIST.BEARING_SEAT",
        "partCodes": ["GJM12030409", "GJM1203040902"],
        "description": "轴承座总成 → 轴承振动",
        "sensors": [
            {"id": "VT-05", "type": "vibration", "position": "drum bearing DE", "sampleRate": 12800},
            {"id": "VT-06", "type": "vibration", "position": "drum bearing NDE", "sampleRate": 12800},
        ],
        "algorithms": ["bearing_defect_frequency", "envelope_demod", "kurtosis"],
    },
    {
        "componentCode": "TROLLEY.TRAVEL",
        "partCodes": ["GJM120303"],
        "description": "小车运行机构 → 电机振动",
        "sensors": [
            {"id": "VT-07", "type": "vibration", "position": "trolley motor DE", "sampleRate": 12800},
            {"id": "VT-08", "type": "vibration", "position": "trolley motor NDE", "sampleRate": 12800},
        ],
        "algorithms": ["fft_spectrum", "envelope_demod", "cepstrum"],
    },
    {
        "componentCode": "TROLLEY.TRAVEL.WHEEL_ASSY",
        "partCodes": ["GJM12030301", "GJM12030302"],
        "description": "车轮总成 → 车轮轴承振动",
        "sensors": [
            {"id": "VT-09", "type": "vibration", "position": "trolley wheel bearing", "sampleRate": 12800},
        ],
        "algorithms": ["bearing_defect_frequency", "envelope_demod"],
    },
    {
        "componentCode": "TROLLEY.TRAVEL.GBX_MOUNT",
        "partCodes": ["GJM12030303"],
        "description": "减速器固定座 → 减速器振动",
        "sensors": [
            {"id": "VT-10", "type": "vibration", "position": "trolley gearbox HS", "sampleRate": 12800},
            {"id": "VT-11", "type": "vibration", "position": "trolley gearbox LS", "sampleRate": 12800},
        ],
        "algorithms": ["gear_mesh_analysis", "bearing_defect_frequency"],
    },
]

# 已知无传感器映射的辅助件
UNMAPPED_PARTS = [
    "GJM120307",   # 锚定装置
    "GJM120308",   # 电缆固定装置
    "GJM120309",   # 润滑站底座
    "GJM120310",   # 悬臂吊
    "GJM120301",   # 小车架（结构件，无旋转部件）
    "GJM120305",   # 钢丝绳缠绕（绳索本身）
    "GJM120306",   # 水平轮（导向件）
]


def generate_sensor_mapping(files: list[dict]) -> dict[str, Any]:
    """生成部件-传感器映射。"""
    # 检查所有编码，找出未映射的
    all_subsystem_codes = set()
    for f in files:
        code = normalize_code(f["fileCode"])
        # 取到子系统级 (GJM1203XX)
        if len(code) >= 10:
            all_subsystem_codes.add(code[:10])
        elif len(code) >= 8:
            all_subsystem_codes.add(code[:8])

    mapped_codes = set()
    for m in SENSOR_MAPPINGS:
        for pc in m["partCodes"]:
            mapped_codes.add(normalize_code(pc))

    unmapped = sorted(
        set(normalize_code(c) for c in UNMAPPED_PARTS)
        | (all_subsystem_codes - mapped_codes - set(normalize_code(c) for c in UNMAPPED_PARTS))
    )

    return {
        "deviceModel": "GJM12",
        "assembly": "03-小车总成",
        "mappings": SENSOR_MAPPINGS,
        "unmappedParts": unmapped,
        "notes": "传感器映射基于 RTG 标准布点方案（VT-01~VT-16），"
                 "此处仅列出与小车总成相关的测点。",
    }


# ---------------------------------------------------------------------------
# Step 5b: Cypher 初始化语句
# ---------------------------------------------------------------------------

def generate_cypher(
    tree: dict, sensor_map: dict, files: list[dict]
) -> str:
    """生成 Neo4j Cypher 初始化语句。"""
    lines: list[str] = []

    # --- Section 0: 约束和索引 ---
    lines.append("// ============================================================")
    lines.append("// GJM12-03 小车总成 知识图谱初始化")
    lines.append("// 自动生成 by cad-knowledge-pipeline.py")
    lines.append("// ============================================================\n")
    lines.append("// --- Section 0: 约束和索引 ---")
    lines.append("CREATE CONSTRAINT IF NOT EXISTS FOR (e:Equipment) REQUIRE e.id IS UNIQUE;")
    lines.append("CREATE CONSTRAINT IF NOT EXISTS FOR (c:Component) REQUIRE c.code IS UNIQUE;")
    lines.append("CREATE CONSTRAINT IF NOT EXISTS FOR (p:Part) REQUIRE p.code IS UNIQUE;")
    lines.append("CREATE CONSTRAINT IF NOT EXISTS FOR (s:Sensor) REQUIRE s.id IS UNIQUE;")
    lines.append("CREATE CONSTRAINT IF NOT EXISTS FOR (a:Algorithm) REQUIRE a.name IS UNIQUE;")
    lines.append("CREATE INDEX IF NOT EXISTS FOR (c:Component) ON (c.componentCode);")
    lines.append("CREATE INDEX IF NOT EXISTS FOR (p:Part) ON (p.componentCode);")
    lines.append("")

    # --- Section 1: Equipment 节点 ---
    lines.append("// --- Section 1: Equipment 节点 ---")
    lines.append(
        'MERGE (equip:Equipment {id: "GJM12"}) '
        "SET equip.name = '港机设备 GJM12', "
        "equip.model = 'GJM12', "
        "equip.type = 'RTG', "
        "equip.project = '日照项目';"
    )
    lines.append("")

    # --- Section 2: Component 节点（主要子系统） ---
    lines.append("// --- Section 2: Component 节点 ---")
    subsystem_codes_seen: set[str] = set()

    def emit_component_nodes(node: dict, depth: int = 0) -> None:
        code = node["code"]
        comp = node.get("componentCode", "")
        name = node.get("name", "")
        if not comp or comp in subsystem_codes_seen:
            pass
        else:
            subsystem_codes_seen.add(comp)
            label = "Component" if depth <= 2 else "Part"
            lines.append(
                f'MERGE (n:{label} {{code: "{code}"}}) '
                f"SET n.name = '{_escape(name)}', "
                f"n.componentCode = '{comp}', "
                f"n.level = {depth};"
            )
        for child in node.get("children", []):
            emit_component_nodes(child, depth + 1)

    emit_component_nodes(tree)
    lines.append("")

    # --- Section 3: HAS_PART 关系 ---
    lines.append("// --- Section 3: HAS_PART 装配关系 ---")
    lines.append(
        'MATCH (equip:Equipment {id: "GJM12"}) '
        'MATCH (trolley:Component {code: "GJM12-03"}) '
        "MERGE (equip)-[:HAS_PART {assembly: '小车总成'}]->(trolley);"
    )

    def emit_has_part(node: dict) -> None:
        parent_code = node["code"]
        for child in node.get("children", []):
            child_code = child["code"]
            child_name = child.get("name", "")
            child_label = "Component" if child.get("children") else "Part"
            # 使用通用匹配
            lines.append(
                f'MATCH (parent {{code: "{parent_code}"}}) '
                f'MATCH (child {{code: "{child_code}"}}) '
                f"MERGE (parent)-[:HAS_PART {{name: '{_escape(child_name)}'}}]->(child);"
            )
            emit_has_part(child)

    emit_has_part(tree)
    lines.append("")

    # --- Section 4: Sensor 节点 ---
    lines.append("// --- Section 4: Sensor 节点 ---")
    sensor_ids_seen: set[str] = set()
    for mapping in sensor_map.get("mappings", []):
        for sensor in mapping.get("sensors", []):
            sid = sensor["id"]
            if sid in sensor_ids_seen:
                continue
            sensor_ids_seen.add(sid)
            lines.append(
                f'MERGE (s:Sensor {{id: "{sid}"}}) '
                f"SET s.type = '{sensor['type']}', "
                f"s.position = '{sensor['position']}', "
                f"s.sampleRate = {sensor.get('sampleRate', 12800)};"
            )
    lines.append("")

    # --- Section 5: HAS_SENSOR 关系 ---
    lines.append("// --- Section 5: HAS_SENSOR 关系 ---")
    for mapping in sensor_map.get("mappings", []):
        comp_code = mapping["componentCode"]
        for part_code in mapping["partCodes"]:
            for sensor in mapping["sensors"]:
                sid = sensor["id"]
                lines.append(
                    f'MATCH (c {{code: "{part_code}"}}) '
                    f'MATCH (s:Sensor {{id: "{sid}"}}) '
                    f"MERGE (c)-[:HAS_SENSOR]->(s);"
                )
    lines.append("")

    # --- Section 6: Algorithm 节点 ---
    lines.append("// --- Section 6: Algorithm 节点 ---")
    algo_set: set[str] = set()
    for mapping in sensor_map.get("mappings", []):
        for algo in mapping.get("algorithms", []):
            algo_set.add(algo)
    for algo in sorted(algo_set):
        lines.append(
            f'MERGE (a:Algorithm {{name: "{algo}"}}) '
            f"SET a.category = 'mechanical';"
        )
    lines.append("")

    # --- Section 7: DIAGNOSED_BY 关系 ---
    lines.append("// --- Section 7: DIAGNOSED_BY 关系 ---")
    for mapping in sensor_map.get("mappings", []):
        for part_code in mapping["partCodes"]:
            for algo in mapping.get("algorithms", []):
                lines.append(
                    f'MATCH (c {{code: "{part_code}"}}) '
                    f'MATCH (a:Algorithm {{name: "{algo}"}}) '
                    f"MERGE (c)-[:DIAGNOSED_BY]->(a);"
                )
    lines.append("")

    # 统计
    n_components = len(subsystem_codes_seen)
    n_sensors = len(sensor_ids_seen)
    n_algos = len(algo_set)
    lines.append(f"// 统计: {n_components} Component/Part 节点, "
                 f"{n_sensors} Sensor 节点, {n_algos} Algorithm 节点")
    lines.append(f"// 文件总数: {len(files)}")

    return "\n".join(lines)


def _escape(s: str) -> str:
    """转义 Cypher 字符串中的单引号。"""
    return s.replace("'", "\\'").replace("\\", "\\\\") if s else ""


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def main() -> None:
    # 解析参数
    source_dir = DEFAULT_SOURCE
    if "--source" in sys.argv:
        idx = sys.argv.index("--source")
        if idx + 1 < len(sys.argv):
            source_dir = sys.argv[idx + 1]

    print(f"[Step 0] 源目录: {source_dir}")
    print(f"[Step 0] 输出目录: {OUTPUT_DIR}")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Step 1: 扫描
    print("\n[Step 1] 扫描 DWG 文件...")
    files = scan_directory(source_dir)
    print(f"  发现 {len(files)} 个 DWG 文件")

    # Step 2: DXF 增强
    print("\n[Step 2] 尝试 DXF 增强解析...")
    dxf_count = try_dxf_enhancement(files, source_dir)
    print(f"  DXF 增强成功: {dxf_count}/{len(files)}")

    # Step 3: 编码映射
    print("\n[Step 3] 生成 4 段式部件编码...")
    assign_component_codes(files)
    coded = sum(1 for f in files if f.get("componentCode"))
    print(f"  编码映射完成: {coded}/{len(files)}")

    # Step 4: 装配树
    print("\n[Step 4] 构建装配树...")
    tree = build_assembly_tree(files, source_dir)
    child_count = count_tree_nodes(tree)
    max_depth = tree_max_depth(tree)
    print(f"  装配树节点数: {child_count}")
    print(f"  最大层级深度: {max_depth}")

    # Step 5: 传感器映射 + Cypher
    print("\n[Step 5] 生成传感器映射和 Cypher...")
    sensor_map = generate_sensor_mapping(files)
    cypher = generate_cypher(tree, sensor_map, files)

    # --- 输出 ---
    print("\n[输出] 写入文件...")

    # 1. parts_inventory.json
    out1 = OUTPUT_DIR / "parts_inventory.json"
    with open(out1, "w", encoding="utf-8") as fp:
        json.dump(files, fp, ensure_ascii=False, indent=2)
    print(f"  {out1.name}: {len(files)} 条记录")

    # 2. assembly_tree.json
    out2 = OUTPUT_DIR / "assembly_tree.json"
    with open(out2, "w", encoding="utf-8") as fp:
        json.dump(tree, fp, ensure_ascii=False, indent=2)
    print(f"  {out2.name}: {child_count} 节点")

    # 3. sensor_mapping.json
    out3 = OUTPUT_DIR / "sensor_mapping.json"
    with open(out3, "w", encoding="utf-8") as fp:
        json.dump(sensor_map, fp, ensure_ascii=False, indent=2)
    print(f"  {out3.name}: {len(sensor_map['mappings'])} 组映射")

    # 4. cypher_init.cql
    out4 = OUTPUT_DIR / "cypher_init.cql"
    with open(out4, "w", encoding="utf-8") as fp:
        fp.write(cypher)
    print(f"  {out4.name}: {len(cypher.splitlines())} 行")

    print("\n[完成] 所有文件已生成到:")
    print(f"  {OUTPUT_DIR}/")
    for f in sorted(OUTPUT_DIR.iterdir()):
        size = f.stat().st_size
        print(f"    {f.name} ({size:,} bytes)")


def count_tree_nodes(node: dict) -> int:
    """递归计算树节点总数。"""
    return 1 + sum(count_tree_nodes(c) for c in node.get("children", []))


def tree_max_depth(node: dict, depth: int = 0) -> int:
    """递归计算树最大深度。"""
    if not node.get("children"):
        return depth
    return max(tree_max_depth(c, depth + 1) for c in node["children"])


if __name__ == "__main__":
    main()
