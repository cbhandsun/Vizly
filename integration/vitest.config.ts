import { defineConfig } from 'vitest/config';
import base from '../vite.config';

export default defineConfig({ ...base, test: {
  ...base.test,
  include: ['integration/s3-storage-service.spec.ts'],
  maxWorkers: 1,
} });
