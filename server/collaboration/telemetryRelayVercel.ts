import { getVercelOidcToken } from '@vercel/oidc';
import { createTelemetryRelay } from './telemetryRelay.js';

// Artifact preparation binds these public URLs into the compiled handler.
// The short-lived workload identity is resolved only inside the function.
export default createTelemetryRelay({
  origin: process.env.VIZLY_TELEMETRY_RELAY_ORIGIN ?? '',
  ingestUrl: process.env.VIZLY_TELEMETRY_RELAY_INGEST ?? '',
  getToken: getVercelOidcToken,
});
