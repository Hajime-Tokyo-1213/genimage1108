import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateImage } from '../imageGenerationService';

// fetch のモック
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('imageGenerationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // デフォルトの成功レスポンスをセットアップ
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                imageData: 'base64-image-data',
                mimeType: 'image/png'
              })
            }]
          }
        }]
      })
    });
  });

  describe('generateImage', () => {
    const mockParams = {
      prompt: 'test prompt',
      mode: 'new' as const,
      uploadedImage: undefined,
      apiKey: 'test-api-key'
    };

    it('should generate image successfully with Gemini 2.5 Flash', async () => {
      const result = await generateImage(mockParams);

      expect(result).toEqual({
        id: expect.any(String),
        prompt: 'test prompt',
        imageUrl: 'data:image/png;base64,base64-image-data',
        createdAt: expect.any(String),
        base64Data: 'base64-image-data'
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('gemini-2.5-flash'),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: expect.stringContaining('test prompt')
        })
      );
    });

    it('should fallback to Imagen 4 when Gemini fails', async () => {
      // Gemini APIの失敗をモック
      mockFetch
        .mockRejectedValueOnce(new Error('Gemini API error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            imageData: 'base64-imagen-data',
            mimeType: 'image/png'
          })
        });

      const result = await generateImage(mockParams);

      expect(result).toEqual({
        id: expect.any(String),
        prompt: 'test prompt',
        imageUrl: 'data:image/png;base64,base64-imagen-data',
        createdAt: expect.any(String),
        base64Data: 'base64-imagen-data'
      });

      // 2回のAPI呼び出しが行われることを確認
      expect(mockFetch).toHaveBeenCalledTimes(2);
      
      // 最後のコールがImagen APIであることを確認
      const lastCall = mockFetch.mock.calls[1];
      expect(lastCall[0]).toContain('imagen-4');
    });

    it('should handle uploaded image in edit mode', async () => {
      const paramsWithImage = {
        ...mockParams,
        mode: 'edit' as const,
        uploadedImage: 'base64-uploaded-image'
      };

      await generateImage(paramsWithImage);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.contents[0].parts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            inlineData: {
              data: 'base64-uploaded-image',
              mimeType: 'image/png'
            }
          })
        ])
      );
    });

    it('should throw error when both APIs fail', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Gemini API error'))
        .mockRejectedValueOnce(new Error('Imagen API error'));

      await expect(generateImage(mockParams)).rejects.toThrow();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle API response errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('API Error Message')
      });

      await expect(generateImage(mockParams)).rejects.toThrow();
    });

    it('should handle malformed API responses', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          // 不正な形式のレスポンス
          invalid: 'response'
        })
      });

      await expect(generateImage(mockParams)).rejects.toThrow();
    });

    it('should validate required parameters', async () => {
      const invalidParams = {
        prompt: '',
        mode: 'new' as const,
        uploadedImage: undefined,
        apiKey: 'test-api-key'
      };

      await expect(generateImage(invalidParams)).rejects.toThrow();
    });

    it('should handle missing API key', async () => {
      const paramsWithoutKey = {
        ...mockParams,
        apiKey: ''
      };

      await expect(generateImage(paramsWithoutKey)).rejects.toThrow();
    });

    it('should include proper headers and request structure for Gemini', async () => {
      await generateImage(mockParams);

      const [url, options] = mockFetch.mock.calls[0];
      
      expect(url).toContain('gemini-2.5-flash');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      
      const requestBody = JSON.parse(options.body);
      expect(requestBody).toHaveProperty('contents');
      expect(requestBody).toHaveProperty('generationConfig');
    });

    it('should include proper headers and request structure for Imagen', async () => {
      // Geminiを失敗させてImagenにフォールバック
      mockFetch
        .mockRejectedValueOnce(new Error('Gemini failed'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            imageData: 'base64-data',
            mimeType: 'image/png'
          })
        });

      await generateImage(mockParams);

      const [, imagenOptions] = mockFetch.mock.calls[1];
      
      expect(imagenOptions.method).toBe('POST');
      expect(imagenOptions.headers['Content-Type']).toBe('application/json');
      
      const requestBody = JSON.parse(imagenOptions.body);
      expect(requestBody).toHaveProperty('prompt');
    });

    it('should generate unique IDs for each image', async () => {
      const result1 = await generateImage(mockParams);
      const result2 = await generateImage(mockParams);

      expect(result1.id).not.toBe(result2.id);
      expect(result1.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(result2.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });
});