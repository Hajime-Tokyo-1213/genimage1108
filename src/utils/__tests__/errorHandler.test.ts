import { describe, it, expect, vi } from 'vitest';
import { normalizeError, getErrorType, getUserFriendlyMessage, handleError, logError } from '../errorHandler';

describe('errorHandler utilities', () => {
  describe('normalizeError', () => {
    it('should normalize Error object', () => {
      const error = new Error('Test error');
      const normalized = normalizeError(error);
      
      expect(normalized.message).toBe('Test error');
      expect(normalized.name).toBe('Error');
    });

    it('should normalize string error', () => {
      const normalized = normalizeError('String error');
      expect(normalized.message).toBe('String error');
      expect(normalized.name).toBe('Error');
    });

    it('should handle object with message property', () => {
      const errorObj = { message: 'Object error', code: 'TEST_ERROR' };
      const normalized = normalizeError(errorObj);
      
      expect(normalized.message).toBe('Object error');
      expect((normalized as any).code).toBe('TEST_ERROR');
    });

    it('should handle unknown error type', () => {
      const normalized = normalizeError(null);
      expect(normalized.message).toBe('不明なエラーが発生しました');
    });

    it('should handle number error', () => {
      const normalized = normalizeError(404);
      expect(normalized.message).toBe('不明なエラーが発生しました');
    });
  });

  describe('getErrorType', () => {
    it('should identify AUTH error by code', () => {
      const error = new Error('Token expired');
      (error as any).code = 'TOKEN_EXPIRED';
      
      expect(getErrorType(error)).toBe('AUTH');
    });

    it('should identify AUTH error by message pattern', () => {
      const error = new Error('Authentication failed');
      
      expect(getErrorType(error)).toBe('AUTH');
    });

    it('should identify NETWORK error', () => {
      const error = new Error('Network error occurred');
      expect(getErrorType(error)).toBe('NETWORK');
    });

    it('should identify API error', () => {
      const error = new Error('API rate limit exceeded');
      expect(getErrorType(error)).toBe('API');
    });

    it('should identify VALIDATION error', () => {
      const error = new Error('Invalid input provided');
      expect(getErrorType(error)).toBe('VALIDATION');
    });

    it('should default to UNKNOWN for unrecognized errors', () => {
      const error = new Error('Some random error');
      expect(getErrorType(error)).toBe('UNKNOWN');
    });
  });

  describe('getUserFriendlyMessage', () => {
    it('should return user-friendly message for AUTH error', () => {
      const error = new Error('Token expired');
      (error as any).code = 'TOKEN_EXPIRED';
      
      const message = getUserFriendlyMessage(error);
      expect(message).toContain('セッションの有効期限が切れました');
    });

    it('should return user-friendly message for NETWORK error', () => {
      const error = new Error('Network error');
      
      const message = getUserFriendlyMessage(error);
      expect(message).toContain('ネットワーク接続を確認してください');
    });

    it('should return user-friendly message for API error', () => {
      const error = new Error('API error');
      
      const message = getUserFriendlyMessage(error);
      expect(message).toContain('サービスに問題が発生しています');
    });

    it('should include context information when provided', () => {
      const error = new Error('Test error');
      const context = { component: 'ImageGenerator', action: 'generate' };
      
      const message = getUserFriendlyMessage(error, context);
      expect(message).toContain('ImageGenerator');
    });

    it('should handle unknown errors gracefully', () => {
      const error = new Error('Random error');
      
      const message = getUserFriendlyMessage(error);
      expect(message).toContain('予期しないエラーが発生しました');
    });
  });

  describe('handleError', () => {
    it('should log error and return user-friendly message', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const error = new Error('Test error');
      const context = { component: 'TestComponent' };
      
      const result = handleError(error, context);
      
      expect(consoleSpy).toHaveBeenCalled();
      expect(result).toContain('予期しないエラーが発生しました');
      
      consoleSpy.mockRestore();
    });
  });

  describe('logError', () => {
    it('should log error with context', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const error = new Error('Test error');
      const context = { component: 'TestComponent', userId: 'user123' };
      
      logError(error, context);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in TestComponent'),
        expect.objectContaining({
          message: 'Test error',
          context: context
        })
      );
      
      consoleSpy.mockRestore();
    });

    it('should log error without context', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const error = new Error('Test error');
      
      logError(error);
      
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
});