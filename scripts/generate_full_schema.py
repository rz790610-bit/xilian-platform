#!/usr/bin/env python3
"""
从 drizzle/schema.ts 解析并生成全量 MySQL DDL。
策略：逐行解析 mysqlTable() 调用，提取表名、列定义、约束。
"""
import re
import sys

SCHEMA_FILE = '/home/ubuntu/xilian-platform/drizzle/schema.ts'

with open(SCHEMA_FILE) as f:
    content = f.read()

# 提取所有 mysqlTable("table_name", { ... }) 调用
# 使用正则找到所有表定义的起始位置
table_pattern = re.compile(r'export const (\w+)\s*=\s*mysqlTable\(\s*["\'](\w+)["\']')

tables = []
matches = list(table_pattern.finditer(content))

for i, m in enumerate(matches):
    var_name = m.group(1)
    table_name = m.group(2)
    start = m.start()
    # 找到这个表定义的结束位置（下一个 export const 或文件末尾）
    if i + 1 < len(matches):
        end = matches[i + 1].start()
    else:
        end = len(content)
    block = content[start:end]
    tables.append((var_name, table_name, block))

print(f"-- 西联平台全量数据库 Schema")
print(f"-- 从 drizzle/schema.ts 自动生成")
print(f"-- 共 {len(tables)} 张表")
print(f"-- 列名风格: snake_case")
print()
print("SET NAMES utf8mb4;")
print("SET FOREIGN_KEY_CHECKS = 0;")
print()

def parse_column(line, table_name):
    """解析单个列定义"""
    # 匹配: varName: type("sql_name", ...).xxx().xxx()
    col_match = re.match(r'\s*(\w+)\s*:\s*(\w+)\(\s*["\'](\w+)["\']', line)
    if not col_match:
        return None
    
    ts_name = col_match.group(1)
    col_type = col_match.group(2)
    sql_name = col_match.group(3)
    
    # 映射 drizzle 类型到 MySQL 类型
    mysql_type = 'VARCHAR(255)'
    
    if col_type == 'int':
        mysql_type = 'INT'
    elif col_type == 'bigint':
        mysql_type = 'BIGINT'
    elif col_type == 'varchar':
        # 提取长度
        len_match = re.search(r'varchar\(["\']' + sql_name + r'["\'],\s*\{\s*length:\s*(\d+)', line)
        if len_match:
            mysql_type = f'VARCHAR({len_match.group(1)})'
        else:
            mysql_type = 'VARCHAR(255)'
    elif col_type == 'text':
        mysql_type = 'TEXT'
    elif col_type == 'boolean':
        mysql_type = 'BOOLEAN'
    elif col_type == 'timestamp':
        mysql_type = 'TIMESTAMP'
    elif col_type == 'double':
        mysql_type = 'DOUBLE'
    elif col_type == 'float':
        mysql_type = 'FLOAT'
    elif col_type == 'json':
        mysql_type = 'JSON'
    elif col_type == 'mysqlEnum':
        # 提取枚举值
        enum_match = re.search(r'mysqlEnum\(["\']' + sql_name + r'["\'],\s*\[([^\]]+)\]', line)
        if enum_match:
            vals = enum_match.group(1).strip()
            mysql_type = f'ENUM({vals})'
        else:
            mysql_type = "ENUM('unknown')"
    
    # 检查约束
    constraints = []
    if '.notNull()' in line:
        constraints.append('NOT NULL')
    if '.autoincrement()' in line:
        constraints.append('AUTO_INCREMENT')
    if '.primaryKey()' in line:
        constraints.append('PRIMARY KEY')
    
    # 默认值
    if '.default(' in line:
        default_match = re.search(r'\.default\(([^)]+)\)', line)
        if default_match:
            val = default_match.group(1).strip()
            if val == 'false':
                constraints.append('DEFAULT FALSE')
            elif val == 'true':
                constraints.append('DEFAULT TRUE')
            elif val == '0':
                constraints.append('DEFAULT 0')
            elif val.startswith("'") or val.startswith('"'):
                constraints.append(f'DEFAULT {val}')
            elif val == 'sql`(now())`' or 'now()' in val:
                constraints.append('DEFAULT CURRENT_TIMESTAMP')
            else:
                try:
                    float(val)
                    constraints.append(f'DEFAULT {val}')
                except:
                    pass
    
    if '.onUpdateNow()' in line or 'ON UPDATE CURRENT_TIMESTAMP' in line.upper():
        constraints.append('ON UPDATE CURRENT_TIMESTAMP')
    
    constraint_str = ' '.join(constraints)
    return f'  `{sql_name}` {mysql_type} {constraint_str}'.rstrip()

def parse_table(var_name, table_name, block):
    """解析整个表定义"""
    lines = block.split('\n')
    columns = []
    primary_key = None
    unique_keys = []
    indexes = []
    
    in_columns = False
    brace_depth = 0
    
    for line in lines:
        stripped = line.strip()
        
        # 跳过空行和注释
        if not stripped or stripped.startswith('//') or stripped.startswith('/*'):
            continue
        
        # 检测列定义区域
        if 'mysqlTable(' in line:
            in_columns = True
            continue
        
        if in_columns:
            col = parse_column(line, table_name)
            if col:
                columns.append(col)
    
    if not columns:
        return None
    
    # 构建 CREATE TABLE
    sql = f'CREATE TABLE IF NOT EXISTS `{table_name}` (\n'
    
    # 检查是否有 id 列作为主键
    has_pk = any('PRIMARY KEY' in c for c in columns)
    
    col_lines = []
    for c in columns:
        if 'PRIMARY KEY' in c and 'AUTO_INCREMENT' in c:
            # 移除 PRIMARY KEY 从列定义，放到表级约束
            c_clean = c.replace(' PRIMARY KEY', '')
            col_lines.append(c_clean)
            pk_name = re.search(r'`(\w+)`', c).group(1)
            primary_key = pk_name
        elif 'PRIMARY KEY' in c:
            c_clean = c.replace(' PRIMARY KEY', '')
            col_lines.append(c_clean)
            pk_name = re.search(r'`(\w+)`', c).group(1)
            primary_key = pk_name
        else:
            col_lines.append(c)
    
    sql += ',\n'.join(col_lines)
    
    if primary_key:
        sql += f',\n  PRIMARY KEY (`{primary_key}`)'
    
    sql += '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;'
    
    return sql

# 生成所有表
generated = 0
for var_name, table_name, block in tables:
    sql = parse_table(var_name, table_name, block)
    if sql:
        print(sql)
        print()
        generated += 1

print(f"-- 共生成 {generated} 张表")
print()
print("SET FOREIGN_KEY_CHECKS = 1;")

sys.stderr.write(f"Total tables found: {len(tables)}, Generated: {generated}\n")
