import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logInvalidHexColor = (hex: unknown): void => {
  safeLog.warn('[layoutUtils] Invalid hex color; using default gray:', redactSensitiveLogValue(hex));
};

export const logInvalidHexFormat = (hex: unknown): void => {
  safeLog.warn('[layoutUtils] Invalid hex format; using default gray:', redactSensitiveLogValue(hex));
};

export const logHexParseFailure = (hex: unknown): void => {
  safeLog.warn('[layoutUtils] Failed to parse hex color; using default gray:', redactSensitiveLogValue(hex));
};

export const logDomainThemeFallback = (domain: unknown): void => {
  safeLog.warn('[layoutUtils] Theme is undefined for domain; using default theme:', redactSensitiveLogValue(domain));
};
