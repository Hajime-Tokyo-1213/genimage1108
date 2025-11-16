export interface GenerateImageParams {
  prompt: string;
  mode: 'new' | 'edit';
  uploadedImage?: string | null;
  apiKey: string;
}

export interface ImageGenerationResponse {
  imageUrl: string;
  base64Data: string;
  mimeType: string;
}

/**
 * 画像を生成する
 */
export const generateImage = async (params: GenerateImageParams): Promise<ImageGenerationResponse> => {
  const { prompt, mode, uploadedImage, apiKey } = params;
  
  if (!prompt.trim()) {
    throw new Error('プロンプトを入力してください');
  }
  
  if (mode === 'edit' && !uploadedImage) {
    throw new Error('画像を修正する場合は、画像をアップロードしてください');
  }
  
  let endpoint: string;
  let body: any;
  
  if (mode === 'edit' && uploadedImage) {
    // Gemini 2.5 Flash Image APIを使用（画像編集）
    endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:predict';
    body = {
      instances: [{
        prompt: prompt,
        image: {
          bytesBase64Encoded: uploadedImage
        }
      }],
      parameters: {
        sampleCount: 1,
        aspectRatio: '1:1'
      }
    };
  } else {
    // Imagen 4 APIを使用（新規作成）
    endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict';
    body = {
      instances: [{
        prompt: prompt,
      }],
      parameters: {
        sampleCount: 1,
        aspectRatio: '1:1'
      }
    };
  }
  
  console.log('画像生成開始:', { endpoint, mode, hasImage: !!uploadedImage });
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  
  console.log('APIレスポンス受信:', { status: response.status, ok: response.ok });
  
  if (!response.ok) {
    let errorData: any = {};
    try {
      const text = await response.text();
      console.error('APIエラーレスポンス:', text);
      errorData = JSON.parse(text);
    } catch (parseErr) {
      console.error('エラーレスポンスのパースに失敗:', parseErr);
      errorData = { error: { message: `HTTP ${response.status}: ${response.statusText}` } };
    }
    const msg = (errorData?.error && (errorData.error.message || errorData.error.status)) ||
      `画像生成に失敗しました (${response.status})`;
    throw new Error(msg);
  }
  
  let data: any;
  try {
    const responseText = await response.text();
    console.log('APIレスポンス本文（最初の200文字）:', responseText.substring(0, 200));
    data = JSON.parse(responseText);
    console.log('パースされたデータ構造:', {
      hasPredictions: !!data?.predictions,
      predictionsLength: Array.isArray(data?.predictions) ? data.predictions.length : 0,
      dataKeys: Object.keys(data || {})
    });
  } catch (parseErr) {
    console.error('レスポンスのJSONパースに失敗:', parseErr);
    throw new Error(`APIレスポンスの解析に失敗しました: ${parseErr.message}`);
  }
  
  const pred = Array.isArray(data?.predictions) ? data.predictions[0] : null;
  console.log('予測データ:', {
    hasPred: !!pred,
    predKeys: pred ? Object.keys(pred) : [],
    hasBytesBase64: !!pred?.bytesBase64Encoded,
    hasImageBytes: !!pred?.image?.imageBytes
  });
  
  const base64Data = pred?.bytesBase64Encoded || pred?.image?.imageBytes || null;
  const mimeType = pred?.mimeType || 'image/png';
  
  if (!base64Data) {
    console.error('画像データが見つかりません。レスポンス構造:', JSON.stringify(data, null, 2));
    throw new Error('画像データが見つかりませんでした（bytesBase64Encoded / imageBytes が不在）');
  }
  
  console.log('画像データ取得成功:', { base64Length: base64Data.length, mimeType });
  
  const imageUrl = `data:${mimeType};base64,${base64Data}`;
  
  return { imageUrl, base64Data, mimeType };
};