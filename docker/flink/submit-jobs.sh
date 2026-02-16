#!/bin/bash
# ============================================================
# Flink Job 提交脚本
# 
# 用途：在 Flink 集群启动后提交流处理 Job
# 使用：./submit-jobs.sh [jobmanager-host] [jobmanager-port]
# ============================================================

set -euo pipefail

JOBMANAGER_HOST="${1:-localhost}"
JOBMANAGER_PORT="${2:-8081}"
FLINK_REST="http://${JOBMANAGER_HOST}:${JOBMANAGER_PORT}"
JOBS_DIR="$(dirname "$0")/jobs"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# 等待 JobManager 就绪
wait_for_jobmanager() {
    local max_attempts=60
    local attempt=0
    
    log "Waiting for Flink JobManager at ${FLINK_REST}..."
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -sf "${FLINK_REST}/overview" > /dev/null 2>&1; then
            log "JobManager is ready"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 5
    done
    
    log "ERROR: JobManager not ready after ${max_attempts} attempts"
    return 1
}

# 检查 Job 是否已在运行
is_job_running() {
    local job_name="$1"
    local running_jobs
    
    running_jobs=$(curl -sf "${FLINK_REST}/jobs/overview" 2>/dev/null || echo '{"jobs":[]}')
    echo "$running_jobs" | python3 -c "
import sys, json
data = json.load(sys.stdin)
jobs = data.get('jobs', [])
for j in jobs:
    if j.get('name') == '${job_name}' and j.get('state') == 'RUNNING':
        print('true')
        sys.exit(0)
print('false')
"
}

# 提交 JAR Job
submit_jar() {
    local jar_path="$1"
    local job_name="$2"
    local entry_class="${3:-}"
    local parallelism="${4:-2}"
    
    if [ "$(is_job_running "$job_name")" = "true" ]; then
        log "Job '${job_name}' is already running, skipping"
        return 0
    fi
    
    log "Uploading JAR: ${jar_path}"
    local upload_response
    upload_response=$(curl -sf -X POST \
        -H "Expect:" \
        -F "jarfile=@${jar_path}" \
        "${FLINK_REST}/jars/upload")
    
    local jar_id
    jar_id=$(echo "$upload_response" | python3 -c "
import sys, json
data = json.load(sys.stdin)
filename = data.get('filename', '')
print(filename.split('/')[-1])
")
    
    if [ -z "$jar_id" ]; then
        log "ERROR: Failed to upload JAR"
        return 1
    fi
    
    log "Submitting Job '${job_name}' (jar: ${jar_id}, parallelism: ${parallelism})"
    
    local run_args=""
    if [ -n "$entry_class" ]; then
        run_args="\"entry-class\": \"${entry_class}\","
    fi
    
    local submit_response
    submit_response=$(curl -sf -X POST \
        -H "Content-Type: application/json" \
        -d "{
            ${run_args}
            \"parallelism\": ${parallelism},
            \"programArgsList\": [
                \"--kafka.bootstrap.servers\", \"kafka:29092\",
                \"--kafka.group.id\", \"xilian-flink-${job_name}\",
                \"--checkpoint.interval\", \"60000\"
            ]
        }" \
        "${FLINK_REST}/jars/${jar_id}/run")
    
    local job_id
    job_id=$(echo "$submit_response" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('jobid', 'unknown'))
")
    
    log "Job '${job_name}' submitted: jobId=${job_id}"
}

# 提交 SQL Job
submit_sql() {
    local sql_file="$1"
    local job_name="$2"
    
    if [ "$(is_job_running "$job_name")" = "true" ]; then
        log "Job '${job_name}' is already running, skipping"
        return 0
    fi
    
    log "Submitting SQL Job '${job_name}' from ${sql_file}"
    # Flink SQL Gateway 提交（需要 Flink SQL Gateway 服务）
    # 这里使用 REST API 的 SQL 执行端点
    log "NOTE: SQL jobs require Flink SQL Gateway. Use 'flink sql-client' for interactive submission."
}

# ============================================================
# 主流程
# ============================================================

wait_for_jobmanager

log "=== Flink Cluster Overview ==="
curl -sf "${FLINK_REST}/overview" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f\"  TaskManagers: {data.get('taskmanagers', 0)}\")
print(f\"  Task Slots: {data.get('slots-total', 0)} total, {data.get('slots-available', 0)} available\")
print(f\"  Running Jobs: {data.get('jobs-running', 0)}\")
print(f\"  Flink Version: {data.get('flink-version', 'unknown')}\")
"

# 提交 Jobs（如果 JAR 文件存在）
if ls "${JOBS_DIR}"/*.jar 1>/dev/null 2>&1; then
    for jar in "${JOBS_DIR}"/*.jar; do
        jar_name=$(basename "$jar" .jar)
        log "Found JAR: ${jar_name}"
        submit_jar "$jar" "$jar_name" "" 2
    done
else
    log "No JAR files found in ${JOBS_DIR}. Place compiled Flink jobs there."
    log "Expected location: docker/flink/jobs/*.jar"
fi

log "=== Job submission completed ==="
