import { useState, useCallback } from 'react';
import { generateImage as generateImageService } from '../services/imageGenerationService';
import { handleError } from '../utils/errorHandler';
import { generateUUID } from '../utils/uuid';
import { ImageData } from '../types';

interface UseImageGenerationOptions {
  onSuccess?: (image: ImageData) => void;
  onError?: (error: string) => void;
}

export interface UseImageGenerationReturn {
  generate: (prompt: string, mode: 'new' | 'edit', uploadedImage?: string | null) => Promise<ImageData | void>;
  loading: boolean;
  error: string | null;
}

export const useImageGeneration = (options: UseImageGenerationOptions = {}): UseImageGenerationReturn => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const generate = useCallback(async (
    prompt: string,
    mode: 'new' | 'edit',
    uploadedImage?: string | null
  ): Promise<ImageData | void> => {
    setLoading(true);
    setError(null);
    
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('APIキーが設定されていません。.env に VITE_GEMINI_API_KEY=... を設定してください。');
      }
      
      const result = await generateImageService({
        prompt,
        mode,
        uploadedImage,
        apiKey,
      });
      
      const newImage: ImageData = {
        id: generateUUID(),
        prompt,
        imageUrl: result.imageUrl,
        fullImageUrl: result.imageUrl,
        thumbnailUrl: result.imageUrl, // サムネイルは後で生成される場合がある
        createdAt: new Date().toISOString(),
        revision: 0,
        title: '',
        saved: false,
      };
      
      if (options.onSuccess) {
        options.onSuccess(newImage);
      }
      
      return newImage;
    } catch (err) {
      const errorMessage = handleError(err, { component: 'useImageGeneration', action: 'generate' });
      setError(errorMessage);
      
      if (options.onError) {
        options.onError(errorMessage);
      }
      
      throw err;
    } finally {
      setLoading(false);
    }
  }, [options]);
  
  return {
    generate,
    loading,
    error,
  };
};

