# ============================================================
# Kafka Connect with pre-installed connectors
# 
# 包含插件:
#   - Debezium MySQL Source (CDC)
#   - JDBC Sink (MySQL → ClickHouse 同步)
#   - Elasticsearch Sink (日志/事件 → ES)
#   - FileStream (开发调试)
# ============================================================
FROM apache/kafka:3.7.0

USER root

# 安装 curl 用于健康检查和插件下载
RUN microdnf install -y curl unzip && microdnf clean all

# 创建插件目录
ENV CONNECT_PLUGIN_PATH=/opt/kafka/connect-plugins
RUN mkdir -p ${CONNECT_PLUGIN_PATH}

# --- Debezium MySQL Source Connector (CDC) ---
ARG DEBEZIUM_VERSION=2.5.4.Final
RUN mkdir -p ${CONNECT_PLUGIN_PATH}/debezium-mysql && \
    curl -fSL "https://repo1.maven.org/maven2/io/debezium/debezium-connector-mysql/${DEBEZIUM_VERSION}/debezium-connector-mysql-${DEBEZIUM_VERSION}-plugin.tar.gz" \
    | tar -xz -C ${CONNECT_PLUGIN_PATH}/debezium-mysql/

# --- Confluent JDBC Connector (Source + Sink) ---
# 使用 Confluent Hub 安装方式的替代：直接下载 jar
ARG KAFKA_CONNECT_JDBC_VERSION=10.7.6
RUN mkdir -p ${CONNECT_PLUGIN_PATH}/kafka-connect-jdbc && \
    curl -fSL "https://packages.confluent.io/maven/io/confluent/kafka-connect-jdbc/${KAFKA_CONNECT_JDBC_VERSION}/kafka-connect-jdbc-${KAFKA_CONNECT_JDBC_VERSION}.jar" \
    -o ${CONNECT_PLUGIN_PATH}/kafka-connect-jdbc/kafka-connect-jdbc-${KAFKA_CONNECT_JDBC_VERSION}.jar || true

# --- MySQL JDBC Driver (for JDBC connector) ---
ARG MYSQL_DRIVER_VERSION=8.0.33
RUN curl -fSL "https://repo1.maven.org/maven2/com/mysql/mysql-connector-j/${MYSQL_DRIVER_VERSION}/mysql-connector-j-${MYSQL_DRIVER_VERSION}.jar" \
    -o ${CONNECT_PLUGIN_PATH}/kafka-connect-jdbc/mysql-connector-j-${MYSQL_DRIVER_VERSION}.jar || true

# --- Elasticsearch Sink Connector ---
ARG ES_CONNECTOR_VERSION=14.0.12
RUN mkdir -p ${CONNECT_PLUGIN_PATH}/kafka-connect-elasticsearch && \
    curl -fSL "https://packages.confluent.io/maven/io/confluent/kafka-connect-elasticsearch/${ES_CONNECTOR_VERSION}/kafka-connect-elasticsearch-${ES_CONNECTOR_VERSION}.jar" \
    -o ${CONNECT_PLUGIN_PATH}/kafka-connect-elasticsearch/kafka-connect-elasticsearch-${ES_CONNECTOR_VERSION}.jar || true

# 设置权限
RUN chown -R appuser:appuser ${CONNECT_PLUGIN_PATH}

USER appuser

# 健康检查
HEALTHCHECK --interval=15s --timeout=10s --retries=5 --start-period=60s \
    CMD curl -f http://localhost:8083/ || exit 1
