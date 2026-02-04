/**
 * 安全模块索引
 * 导出所有安全相关服务
 */

// Vault 服务
export { VaultClient, vaultClient } from './vault/vaultClient';
export { 
  DatabaseCredentialManager, 
  MultiDatabaseCredentialManager,
  DatabaseRoles,
  DatabaseConfigTemplates,
  DatabaseRoleTemplates,
} from './vault/credentialRotation';
export { 
  ApiKeyManager,
  ApiKeyScopes,
  ApiKeyTypeConfigs,
} from './vault/apiKeyManager';
export { 
  PKIManager,
  PKIRoleTemplates,
  PKIEngineConfig,
} from './vault/pkiManager';

// 安全扫描器
export { 
  TrivyScanner, 
  trivyScanner,
  SecurityPolicies as TrivyPolicies,
} from './scanner/trivyScanner';
export { 
  SemgrepScanner, 
  semgrepScanner,
  SemgrepRuleSets,
  SemgrepPolicies,
} from './scanner/semgrepScanner';
export { 
  GitleaksScanner, 
  gitleaksScanner,
  GitleaksPolicies,
} from './scanner/gitleaksScanner';

// Falco 运行时安全
export { 
  FalcoService, 
  falcoService,
  FalcoRuleSets,
} from './falco';
