import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useImageHistory } from '../useImageHistory';
import * as authService from '../../lib/authService';
import { useAuth } from '../../contexts/AuthContext';

vi.mock('../../lib/authService');
vi.mock('../../contexts/AuthContext');

describe('useImageHistory', () => {
  const mockUser = { id: 'user-123' };
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser,
      login: vi.fn(),
      logout: vi.fn(),
      loading: false,
    });
  });

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useImageHistory());

    expect(result.current.images).toEqual([]);
    expect(result.current.historyPage).toBe(0);
    expect(result.current.hasMoreHistory).toBe(true);
    expect(result.current.historyLoading).toBe(false);
  });

  it('should load histories successfully', async () => {
    const mockImages = [
      { id: '1', prompt: 'test1', imageUrl: 'url1', createdAt: '2023-01-01' },
      { id: '2', prompt: 'test2', imageUrl: 'url2', createdAt: '2023-01-02' }
    ];
    
    vi.mocked(authService.getImageHistory).mockResolvedValue({
      images: mockImages,
      hasMore: false
    });

    const { result } = renderHook(() => useImageHistory());

    await waitFor(async () => {
      await result.current.loadHistories();
    });

    expect(result.current.images).toEqual(mockImages);
    expect(result.current.hasMoreHistory).toBe(false);
    expect(result.current.historyLoading).toBe(false);
  });

  it('should handle load history errors', async () => {
    const mockError = new Error('Load failed');
    const onError = vi.fn();
    
    vi.mocked(authService.getImageHistory).mockRejectedValue(mockError);

    const { result } = renderHook(() => useImageHistory({ onError }));

    await waitFor(async () => {
      await result.current.loadHistories();
    });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('履歴の読み込みに失敗しました'));
    expect(result.current.historyLoading).toBe(false);
  });

  it('should save image history successfully', async () => {
    const mockImage = { id: '1', prompt: 'test', imageUrl: 'url', createdAt: '2023-01-01' };
    
    vi.mocked(authService.persistImageHistory).mockResolvedValue();

    const { result } = renderHook(() => useImageHistory());

    await waitFor(async () => {
      await result.current.saveImageHistory(mockImage);
    });

    expect(authService.persistImageHistory).toHaveBeenCalledWith(mockImage);
  });

  it('should handle save image history errors', async () => {
    const mockImage = { id: '1', prompt: 'test', imageUrl: 'url', createdAt: '2023-01-01' };
    const mockError = new Error('Save failed');
    const onError = vi.fn();
    
    vi.mocked(authService.persistImageHistory).mockRejectedValue(mockError);

    const { result } = renderHook(() => useImageHistory({ onError }));

    await waitFor(async () => {
      await result.current.saveImageHistory(mockImage);
    });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('画像履歴の保存に失敗しました'));
  });

  it('should delete image history successfully', async () => {
    const imageId = 'image-123';
    
    vi.mocked(authService.removeImageHistory).mockResolvedValue();

    const { result } = renderHook(() => useImageHistory());

    await waitFor(async () => {
      await result.current.deleteImageHistory(imageId);
    });

    expect(authService.removeImageHistory).toHaveBeenCalledWith(imageId);
  });

  it('should handle delete image history errors', async () => {
    const imageId = 'image-123';
    const mockError = new Error('Delete failed');
    const onError = vi.fn();
    
    vi.mocked(authService.removeImageHistory).mockRejectedValue(mockError);

    const { result } = renderHook(() => useImageHistory({ onError }));

    await waitFor(async () => {
      await result.current.deleteImageHistory(imageId);
    });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('画像履歴の削除に失敗しました'));
  });

  it('should refresh histories successfully', async () => {
    const mockImages = [
      { id: '1', prompt: 'test1', imageUrl: 'url1', createdAt: '2023-01-01' }
    ];
    
    vi.mocked(authService.getImageHistory).mockResolvedValue({
      images: mockImages,
      hasMore: false
    });

    const { result } = renderHook(() => useImageHistory());

    await waitFor(async () => {
      await result.current.refreshHistories();
    });

    expect(result.current.historyPage).toBe(0); // リセットされることを確認
    expect(result.current.images).toEqual(mockImages);
  });

  it('should handle pagination correctly', async () => {
    const page0Images = [
      { id: '1', prompt: 'test1', imageUrl: 'url1', createdAt: '2023-01-01' }
    ];
    const page1Images = [
      { id: '2', prompt: 'test2', imageUrl: 'url2', createdAt: '2023-01-02' }
    ];
    
    // 最初のページ
    vi.mocked(authService.getImageHistory)
      .mockResolvedValueOnce({
        images: page0Images,
        hasMore: true
      })
      .mockResolvedValueOnce({
        images: page1Images,
        hasMore: false
      });

    const { result } = renderHook(() => useImageHistory());

    // 最初のページをロード
    await waitFor(async () => {
      await result.current.loadHistories();
    });

    expect(result.current.images).toEqual(page0Images);
    expect(result.current.hasMoreHistory).toBe(true);
    expect(result.current.historyPage).toBe(1);

    // 次のページをロード
    await waitFor(async () => {
      await result.current.loadHistories();
    });

    expect(result.current.images).toEqual([...page0Images, ...page1Images]);
    expect(result.current.hasMoreHistory).toBe(false);
    expect(result.current.historyPage).toBe(2);
  });

  it('should not load when user is not authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      loading: false,
    });

    const { result } = renderHook(() => useImageHistory());

    await waitFor(async () => {
      await result.current.loadHistories();
    });

    expect(authService.getImageHistory).not.toHaveBeenCalled();
  });
});