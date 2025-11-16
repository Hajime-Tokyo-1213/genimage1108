import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEnvVar, resolveSiteUrl } from '../env';

describe('env utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getEnvVar', () => {
    it('should return environment variable from import.meta.env', () => {
      const originalEnv = import.meta.env;
      (import.meta as any).env = { ...originalEnv, VITE_TEST_KEY: 'test-value' };
      
      expect(getEnvVar('VITE_TEST_KEY')).toBe('test-value');
      
      (import.meta as any).env = originalEnv;
    });

    it('should return undefined if variable does not exist', () => {
      expect(getEnvVar('NON_EXISTENT_KEY')).toBeUndefined();
    });

    it('should return process.env variable when import.meta.env is not available', () => {
      const originalImportMeta = import.meta;
      const originalProcess = global.process;
      
      // import.meta を undefined にして process.env をモック
      (global as any).import = { meta: undefined };
      (global as any).process = { env: { TEST_PROCESS_VAR: 'process-value' } };
      
      expect(getEnvVar('TEST_PROCESS_VAR')).toBe('process-value');
      
      (global as any).import = { meta: originalImportMeta };
      (global as any).process = originalProcess;
    });
  });

  describe('resolveSiteUrl', () => {
    it('should return VITE_SITE_URL if set', () => {
      const originalEnv = import.meta.env;
      (import.meta as any).env = { ...originalEnv, VITE_SITE_URL: 'https://example.com' };
      
      expect(resolveSiteUrl()).toBe('https://example.com');
      
      (import.meta as any).env = originalEnv;
    });

    it('should return window.location.origin if env var is not set', () => {
      const originalEnv = import.meta.env;
      (import.meta as any).env = { ...originalEnv };
      delete (import.meta as any).env.VITE_SITE_URL;
      
      Object.defineProperty(window, 'location', {
        value: { origin: 'https://localhost:3000' },
        writable: true,
        configurable: true,
      });
      
      expect(resolveSiteUrl()).toBe('https://localhost:3000');
      
      (import.meta as any).env = originalEnv;
    });

    it('should handle missing window.location gracefully', () => {
      const originalEnv = import.meta.env;
      const originalWindow = global.window;
      
      (import.meta as any).env = {};
      delete (global as any).window;
      
      expect(resolveSiteUrl()).toBe('http://localhost:5173');
      
      (import.meta as any).env = originalEnv;
      (global as any).window = originalWindow;
    });
  });
});