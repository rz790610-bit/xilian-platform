{{/*
西联智能平台 Helm Chart 模板辅助函数
*/}}

{{/*
展开 chart 名称
*/}}
{{- define "xilian.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
创建完全限定的应用名称
*/}}
{{- define "xilian.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart 标签
*/}}
{{- define "xilian.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
通用标签
*/}}
{{- define "xilian.labels" -}}
helm.sh/chart: {{ include "xilian.chart" . }}
{{ include "xilian.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: xilian-platform
{{- end }}

{{/*
选择器标签
*/}}
{{- define "xilian.selectorLabels" -}}
app.kubernetes.io/name: {{ include "xilian.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
ServiceAccount 名称
*/}}
{{- define "xilian.serviceAccountName" -}}
{{- default (include "xilian.fullname" .) .Values.serviceAccount.name }}
{{- end }}

{{/*
命名空间
*/}}
{{- define "xilian.namespace" -}}
{{- default .Values.global.namespace .Release.Namespace }}
{{- end }}

{{/*
镜像引用
*/}}
{{- define "xilian.image" -}}
{{- if .Values.global.imageRegistry }}
{{- printf "%s/%s:%s" .Values.global.imageRegistry .repository .tag }}
{{- else }}
{{- printf "%s:%s" .repository .tag }}
{{- end }}
{{- end }}

{{/* ============================================================ */}}
{{/* v4.1: 微服务模板已移除，改为单体部署                      */}}
{{/* 保留 commonEnv 供 app-deployment.yaml 使用              */}}
{{/* ============================================================ */}}

{{/*
通用环境变量 — 基础设施连接信息
*/}}
{{- define "xilian.commonEnv" -}}
- name: NODE_ENV
  value: {{ .Values.global.environment | quote }}
- name: LOG_LEVEL
  value: {{ .Values.global.logLevel | quote }}
- name: TRACING_ENABLED
  value: {{ .Values.global.tracingEnabled | quote }}
- name: OTLP_ENDPOINT
  value: {{ .Values.global.otlpEndpoint | quote }}
- name: KAFKA_BROKERS
  value: {{ printf "%s-kafka:9092" .Release.Name | quote }}
- name: CLICKHOUSE_URL
  value: {{ printf "http://%s-clickhouse:8123" .Release.Name | quote }}
- name: QDRANT_URL
  value: "http://qdrant:6333"
- name: NEO4J_URI
  value: "bolt://neo4j:7687"
- name: ELASTICSEARCH_URL
  value: {{ printf "http://%s-elasticsearch:9200" .Release.Name | quote }}
- name: MINIO_ENDPOINT
  value: {{ printf "%s-minio:9000" .Release.Name | quote }}
- name: REDIS_URL
  valueFrom:
    secretKeyRef:
      name: xilian-secrets
      key: redis-url
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: xilian-secrets
      key: mysql-url
- name: JWT_SECRET
  valueFrom:
    secretKeyRef:
      name: xilian-secrets
      key: jwt-secret
{{- end }}

{{/*
通用健康检查探针
*/}}
{{- define "xilian.probes" -}}
livenessProbe:
  httpGet:
    path: /healthz
    port: http
  initialDelaySeconds: 30
  periodSeconds: 30
  timeoutSeconds: 5
  failureThreshold: 3
readinessProbe:
  httpGet:
    path: /healthz/ready
    port: http
  initialDelaySeconds: 15
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 3
startupProbe:
  httpGet:
    path: /healthz
    port: http
  initialDelaySeconds: 10
  periodSeconds: 5
  failureThreshold: 30
{{- end }}

{{/*
Pod 安全上下文
*/}}
{{- define "xilian.podSecurityContext" -}}
runAsNonRoot: true
runAsUser: 1000
runAsGroup: 1000
fsGroup: 1000
seccompProfile:
  type: RuntimeDefault
{{- end }}

{{/*
容器安全上下文
*/}}
{{- define "xilian.containerSecurityContext" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop:
    - ALL
{{- end }}

{{/*
Pod 反亲和性（审核意见6 优化1: Anti-Affinity）
用法: {{ include "xilian.antiAffinity" (dict "name" "device") }}
*/}}
{{- define "xilian.antiAffinity" -}}
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchExpressions:
              - key: app.kubernetes.io/name
                operator: In
                values:
                  - {{ .name }}
          topologyKey: kubernetes.io/hostname
{{- end }}
