import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useImageGeneration } from '../useImageGeneration';
import * as imageGenerationService from '../../services/imageGenerationService';

vi.mock('../../services/imageGenerationService');

describe('useImageGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useImageGeneration());

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(typeof result.current.generate).toBe('function');
  });

  it('should generate image successfully', async () => {
    const mockImage = { 
      id: 'test-id',
      imageUrl: 'data:image/png;base64,test', 
      base64Data: 'test',
      prompt: 'test prompt'
    };
    const onSuccess = vi.fn();
    
    vi.mocked(imageGenerationService.generateImage).mockResolvedValue(mockImage);

    const { result } = renderHook(() => useImageGeneration({
      onSuccess
    }));

    expect(result.current.loading).toBe(false);

    // 画像生成を実行
    const generatePromise = result.current.generate('test prompt', 'new');

    // ローディング状態を確認
    expect(result.current.loading).toBe(true);

    await waitFor(async () => {
      await generatePromise;
    });

    // 生成完了後の状態を確認
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(onSuccess).toHaveBeenCalledWith(mockImage);
    expect(imageGenerationService.generateImage).toHaveBeenCalledWith({
      prompt: 'test prompt',
      mode: 'new',
      uploadedImage: undefined,
      apiKey: expect.any(String),
    });
  });

  it('should handle errors correctly', async () => {
    const mockError = new Error('API error');
    const onError = vi.fn();
    
    vi.mocked(imageGenerationService.generateImage).mockRejectedValue(mockError);

    const { result } = renderHook(() => useImageGeneration({
      onError
    }));

    const generatePromise = result.current.generate('test prompt', 'new');

    await waitFor(async () => {
      try {
        await generatePromise;
      } catch (e) {
        // エラーが適切にスローされることを確認
      }
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(onError).toHaveBeenCalled();
  });

  it('should handle image generation with uploaded image', async () => {
    const mockImage = { 
      id: 'test-id',
      imageUrl: 'data:image/png;base64,test', 
      base64Data: 'test',
      prompt: 'test prompt'
    };
    const uploadedImage = 'base64-uploaded-image';
    
    vi.mocked(imageGenerationService.generateImage).mockResolvedValue(mockImage);

    const { result } = renderHook(() => useImageGeneration());

    await waitFor(async () => {
      await result.current.generate('test prompt', 'edit', null, uploadedImage);
    });

    expect(imageGenerationService.generateImage).toHaveBeenCalledWith({
      prompt: 'test prompt',
      mode: 'edit',
      uploadedImage: uploadedImage,
      apiKey: expect.any(String),
    });
  });

  it('should handle regeneration with image ID', async () => {
    const mockImage = { 
      id: 'regenerated-id',
      imageUrl: 'data:image/png;base64,regenerated', 
      base64Data: 'regenerated',
      prompt: 'regenerated prompt'
    };
    
    vi.mocked(imageGenerationService.generateImage).mockResolvedValue(mockImage);

    const { result } = renderHook(() => useImageGeneration());

    await waitFor(async () => {
      await result.current.generate('regenerated prompt', 'new', 'original-image-id');
    });

    expect(imageGenerationService.generateImage).toHaveBeenCalledWith({
      prompt: 'regenerated prompt',
      mode: 'new',
      uploadedImage: undefined,
      apiKey: expect.any(String),
    });
  });

  it('should reset error state on successful generation', async () => {
    const mockError = new Error('First error');
    const mockImage = { 
      id: 'test-id',
      imageUrl: 'data:image/png;base64,test', 
      base64Data: 'test',
      prompt: 'test prompt'
    };
    
    // 最初のモックはエラーを返す
    vi.mocked(imageGenerationService.generateImage)
      .mockRejectedValueOnce(mockError)
      .mockResolvedValueOnce(mockImage);

    const { result } = renderHook(() => useImageGeneration());

    // 最初のリクエストでエラー
    try {
      await result.current.generate('test prompt', 'new');
    } catch (e) {
      // エラーを無視
    }

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    // 2回目のリクエストで成功
    await waitFor(async () => {
      await result.current.generate('test prompt', 'new');
    });

    expect(result.current.error).toBe(null);
  });
});