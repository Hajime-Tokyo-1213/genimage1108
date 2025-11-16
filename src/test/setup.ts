import '@testing-library/jest-dom';
import { vi } from 'vitest';

// モックの設定
global.fetch = vi.fn();

// ローカルストレージのモック
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
});

// ロケーションのモック
Object.defineProperty(window, 'location', {
  value: {
    origin: 'http://localhost:3000',
    href: 'http://localhost:3000',
  },
  writable: true,
});