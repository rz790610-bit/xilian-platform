export const KAFKA_TOPICS = {
  TELEMETRY_RAW: "xilian.telemetry.raw",
  TELEMETRY_PROCESSED: "xilian.telemetry.processed",
  ALERT_EVENTS: "xilian.alert.events",
  DEVICE_COMMANDS: "xilian.device.commands",
  DEVICE_STATUS: "xilian.device.status",
  GOVERNANCE_TASKS: "xilian.governance.tasks",
  SYSTEM_EVENTS: "xilian.system.events",
} as const;
