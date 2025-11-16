import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { useAuth } from './contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './ImageGenerator.css';
import { supabase, requireSession } from './lib/supabaseClient';
import { persistImageHistory, removeImageHistory, persistImageArchive } from './lib/authService';
import { handleError } from './utils/errorHandler.ts';
import { useImageGeneration } from './hooks/useImageGeneration';
import { generateUUID } from './utils/uuid';
import { useImageHistory } from './hooks/useImageHistory';
import { useStyleManagement } from './hooks/useStyleManagement';
import PromptMaker from './components/PromptMaker';
import HistoryItem from './components/HistoryItem';



const ImageGenerator = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState([]); // 表示用の画像配列
  const [currentImageId, setCurrentImageId] = useState(null); // 現在表示中の画像ID
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedImageIds, setSelectedImageIds] = useState(new Set()); // v4: 選択された画像ID
  const [uploadedImage, setUploadedImage] = useState(null); // v3: アップロード画像
  const [showRegenerateForm, setShowRegenerateForm] = useState(false); // v2: 再生成フォーム表示
  const [showAddStyleForm, setShowAddStyleForm] = useState(false); // v5: スタイル追加フォーム
  const [newStyleName, setNewStyleName] = useState(''); // v5: 新規スタイル名
  const [newStylePrompt, setNewStylePrompt] = useState(''); // v5: 新規スタイルプロンプト
  const [editingStyleId, setEditingStyleId] = useState(null); // 編集中のスタイルID
  const [editStyleName, setEditStyleName] = useState(''); // 編集用スタイル名
  const [editStylePrompt, setEditStylePrompt] = useState(''); // 編集用スタイルプロンプト
  const [mode, setMode] = useState('new'); // 'new' | 'edit'
  const [isDraggingOver, setIsDraggingOver] = useState(false); // ドラッグオーバー状態
  const [appMode, setAppMode] = useState('image'); // 'image' | 'prompt' - アプリ全体のモード
  const [quickLookImage, setQuickLookImage] = useState(null); // クイックルック表示中の画像
  const [editingTitleId, setEditingTitleId] = useState(null); // 編集中のタイトルID
  const [editingTitle, setEditingTitle] = useState(''); // 編集中のタイトル
  const [expandedStyleIds, setExpandedStyleIds] = useState(new Set()); // 展開されているスタイルID
  const [selectedStyleId, setSelectedStyleId] = useState(null); // 選択されたスタイルID
  const [objectInputs, setObjectInputs] = useState({ person: '', background: '', other: '' }); // オブジェクト入力（後方互換性のため残す）
  const [yamlInput, setYamlInput] = useState(''); // YAML形式の入力（後方互換性のため残す）
  const [currentYamlData, setCurrentYamlData] = useState(null); // 現在のYAMLデータ（オブジェクト形式）
  const [yamlJsonText, setYamlJsonText] = useState(''); // YAMLのJSONテキスト（編集用）
  const [yamlJapaneseTranslation, setYamlJapaneseTranslation] = useState(''); // YAMLの日本語訳
  const [isTranslatingYaml, setIsTranslatingYaml] = useState(false); // 翻訳中フラグ
  const base64CacheRef = useRef(new Map());

  const presentError = useCallback((message, detail) => {
    const context = {
      component: 'ImageGenerator',
      userId: user?.id,
    };
    const userMessage = handleError(detail || message, context);
    setError(userMessage);
  }, [user?.id]);

  // 画像生成カスタムフック
  // 履歴管理カスタムフック
  const {
    images: historyImages,
    historyPage,
    hasMoreHistory,
    historyLoading,
    loadHistories,
    saveImageHistory,
    deleteImageHistory,
    refreshHistories,
  } = useImageHistory({
    onError: (errorMessage) => {
      setError(errorMessage);
    },
  });

  // スタイル管理カスタムフック
  const {
    styles,
    stylesLoading,
    loadStyles: refreshStyles,
    saveStyle,
    deleteStyle,
    addStyle,
  } = useStyleManagement({
    onError: (errorMessage) => {
      setError(errorMessage);
    },
  });

  const { generate: generateImageFromService, loading: generationLoading, error: generationError } = useImageGeneration({
    onSuccess: async (image) => {
      // サムネイル生成を試みる
      let thumbnailUrl = image.imageUrl;
      try {
        thumbnailUrl = await requestThumbnailFromApi(image.imageUrl, 200);
        console.log('サムネイル生成成功');
      } catch (thumbErr) {
        console.warn('サムネイル生成に失敗しました。元画像を使用します:', thumbErr);
      }

      const newImage = {
        ...image,
        thumbnailUrl,
        originalImage: uploadedImage ? uploadedImage : null,
      };

      // 成功時の処理
      setImages(prev => {
        if (!Array.isArray(prev)) {
          console.warn('images状態が配列ではありません。初期化します。');
          return [newImage];
        }
        return [newImage, ...prev];
      });
      setCurrentImageId(newImage.id);
      setPrompt('');
      setUploadedImage(null);
      setMode('new');
      setSelectedStyleId(null);
      setObjectInputs({ person: '', background: '', other: '' });
      setYamlInput('');
      setShowRegenerateForm(false);

      // 画像履歴の保存を試みる
      try {
        await saveImageHistory(newImage);
      } catch (syncErr) {
        console.warn('画像履歴の保存に失敗しました（画像は正常に生成されています）:', syncErr);
      }
    },
    onError: (errorMessage) => {
      setError(errorMessage);
    },
  });

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);







  // historyImagesが更新されたときにimagesも同期
  useEffect(() => {
    setImages(historyImages);
  }, [historyImages]);

  useEffect(() => {
    if (!user?.id) {
      setImages([]);
      return;
    }
  }, [user?.id]);

  // 画像をBase64に変換
  const imageToBase64 = useCallback((file) => {
    const cacheKey = `${file.name}-${file.size}-${file.lastModified}`;
    if (base64CacheRef.current.has(cacheKey)) {
      return Promise.resolve(base64CacheRef.current.get(cacheKey));
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        base64CacheRef.current.set(cacheKey, base64);
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  // サムネイル生成関数（F-01）
  const generateThumbnail = (imageUrl, maxSize = 200) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // アスペクト比を維持してリサイズ
          const ratio = Math.min(maxSize / img.width, maxSize / img.height);
          canvas.width = img.width * ratio;
          canvas.height = img.height * ratio;
          
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
          resolve(thumbnail);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = reject;
      img.src = imageUrl;
    });
  };

  const requestThumbnailFromApi = async (imageUrl, maxSize = 200) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return await generateThumbnail(imageUrl, maxSize);
    } catch (err) {
      console.warn('サムネイルAPIが利用できません。ローカル生成にフォールバックします', err);
      return generateThumbnail(imageUrl, maxSize);
    }
  };

  // Base64文字列からBase64データを抽出（data:image/...;base64, の部分を除去）
  const extractBase64FromDataUrl = (dataUrl) => {
    return dataUrl.split(',')[1];
  };

  // ドラッグ開始
  const handleDragStart = useCallback((e, imageId) => {
    e.dataTransfer.setData('imageId', imageId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  // ドラッグオーバー
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDraggingOver(true);
  }, []);

  // ドラッグリーブ
  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDraggingOver(false);
  }, []);

  // ドロップ
  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
    
      const imageId = e.dataTransfer.getData('imageId');
      if (imageId && Array.isArray(images)) {
        const image = images.find(img => img && img.id === imageId);
        const imageSource = image?.fullImageUrl || image?.imageUrl || image?.thumbnailUrl;
        if (imageSource) {
          try {
            // Base64データを抽出
            const base64 = extractBase64FromDataUrl(imageSource);
            setUploadedImage(base64);
            setMode('edit'); // 修正モードに切り替え
            setError(null);
          } catch (err) {
            presentError('画像データの処理に失敗しました', err);
          }
        } else {
          console.warn('ドラッグされた画像に利用可能なデータがありません');
          setError('この履歴画像のデータを取得できませんでした');
        }
      }
  }, [images, presentError]);

  // 画像履歴の逆順表示用メモ化
  const reversedImages = useMemo(() => {
    return [...images].reverse();
  }, [images]);

  const generateImage = async (regenerateId = null, newPrompt = null) => {
    // F-07: オブジェクト入力がある場合はbuildFinalPromptを使用
    const finalPrompt = buildFinalPrompt;
    const promptToUse = newPrompt || (finalPrompt.trim() ? finalPrompt : prompt);
    if (!promptToUse.trim()) {
      setError('プロンプトを入力してください');
      return;
    }

    // 修正モードで画像がアップロードされていない場合はエラー
    const currentMode = regenerateId ? 'edit' : mode; // 再生成の場合は元のモードを維持
    if (currentMode === 'edit' && !uploadedImage) {
      setError('画像を修正する場合は、画像をアップロードしてください');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('APIキーが設定されていません。.env に VITE_GEMINI_API_KEY=... を設定してください。');
      }

      let endpoint;
      let body;

      if (currentMode === 'edit' && uploadedImage) {
        // Gemini 2.5 Flash Image APIを使用（画像編集）
        endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:predict';
        
        body = {
          instances: [{
            prompt: promptToUse,
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
            prompt: promptToUse,
          }],
          parameters: {
            sampleCount: 1,
            aspectRatio: '1:1'
          }
        };
      }

      console.log('画像生成開始:', { endpoint, mode: currentMode, hasImage: !!uploadedImage });
      
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
        let errorData = {};
        try {
          const text = await response.text();
          console.error('APIエラーレスポンス:', text);
          errorData = JSON.parse(text);
        } catch (parseErr) {
          console.error('エラーレスポンスのパースに失敗:', parseErr);
        }
        const msg =
          (errorData?.error && (errorData.error.message || errorData.error.status)) ||
          `画像生成に失敗しました (${response.status})`;
        throw new Error(msg);
      }

      let data;
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

      const base64 =
        pred?.bytesBase64Encoded ||
        pred?.image?.imageBytes ||
        null;

      const mime = pred?.mimeType || 'image/png';

      if (!base64) {
        console.error('画像データが見つかりません。レスポンス構造:', JSON.stringify(data, null, 2));
        throw new Error('画像データが見つかりませんでした（bytesBase64Encoded / imageBytes が不在）');
      }

      console.log('画像データ取得成功:', { base64Length: base64.length, mime });

      const imageDataUrl = `data:${mime};base64,${base64}`;
      const imageId = regenerateId || generateUUID();
      const revision = regenerateId && Array.isArray(images)
        ? ((images.find(img => img && img.id === regenerateId)?.revision || 0) + 1)
        : 0;

      // サムネイルを生成
      let thumbnailUrl = imageDataUrl; // フォールバック用
      try {
        thumbnailUrl = await requestThumbnailFromApi(imageDataUrl, 200);
        console.log('サムネイル生成成功');
      } catch (thumbErr) {
        console.warn('サムネイル生成に失敗しました。元画像を使用します:', thumbErr);
        thumbnailUrl = imageDataUrl;
      }

      const newImage = {
        id: imageId,
        prompt: promptToUse,
        thumbnailUrl: thumbnailUrl, // サムネイル
        fullImageUrl: imageDataUrl, // フルサイズ画像（メモリ上のみ）
        createdAt: new Date().toISOString(),
        revision,
        originalImage: uploadedImage ? uploadedImage : null,
        title: '', // タイトル（F-03で編集可能）
        saved: false // 保存済みフラグ
      };

      // 画像データの検証
      if (!newImage.id || !newImage.thumbnailUrl || !newImage.prompt) {
        throw new Error('画像データの生成に失敗しました（必須フィールドが不足しています）');
      }

      try {
        if (regenerateId) {
          // 再生成の場合、同じIDでrevisionを増やす
          setImages(prev => {
            if (!Array.isArray(prev)) {
              console.warn('images状態が配列ではありません。初期化します。');
              return [newImage];
            }
            return [...prev, newImage];
          });
        } else {
          // 新規生成の場合
          setImages(prev => {
            if (!Array.isArray(prev)) {
              console.warn('images状態が配列ではありません。初期化します。');
              return [newImage];
            }
            return [...prev, newImage];
          });
          setPrompt(''); // フォームをクリア
          setUploadedImage(null); // アップロード画像をクリア
          setMode('new'); // モードを新規作成に戻す
          setSelectedStyleId(null); // スタイル選択をクリア
          setObjectInputs({ person: '', background: '', other: '' }); // オブジェクト入力をクリア
          setYamlInput(''); // YAML入力をクリア
        }

        setCurrentImageId(newImage.id);
        setShowRegenerateForm(false);
        console.log('画像生成成功:', { imageId: newImage.id, revision: newImage.revision });
        
        // 画像履歴の保存を試みる（エラーが発生しても処理は続行）
        try {
          await saveImageHistory(newImage);
        } catch (syncErr) {
          // 画像履歴の保存に失敗しても、画像生成自体は成功しているので警告のみ
          console.warn('画像履歴の保存に失敗しました（画像は正常に生成されています）:', syncErr);
          // エラーメッセージは既に presentError で表示されているので、ここではログのみ
        }
        
        // 削除されないアーカイブに保存（エラーが発生しても処理は続行）
        try {
          await persistImageArchive(newImage, supabase);
        } catch (archiveErr) {
          // アーカイブの保存に失敗しても、画像生成自体は成功しているので警告のみ
          console.warn('画像アーカイブの保存に失敗しました（画像は正常に生成されています）:', archiveErr);
        }
      } catch (stateErr) {
        console.error('状態更新エラー:', stateErr);
        throw new Error(`画像の保存に失敗しました: ${stateErr.message}`);
      }
    } catch (err) {
      presentError('画像生成に失敗しました', err);
    } finally {
      // エラーが発生しても必ずローディング状態を解除
      setLoading(false);
    }
  };

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    generateImage();
  }, [generateImage]);

  const handleRegenerate = useCallback(() => {
    setShowRegenerateForm(true);
  }, []);

  const handleRegenerateSubmit = useCallback((e) => {
    e.preventDefault();
    const regeneratePrompt = e.target.regeneratePrompt.value;
    if (currentImageId) {
      generateImage(currentImageId, regeneratePrompt);
    }
  }, [currentImageId, generateImage]);

  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('画像ファイルを選択してください');
      return;
    }

    try {
      const base64 = await imageToBase64(file);
      setUploadedImage(base64);
      setMode('edit'); // ファイルアップロード時は自動で修正モードに
      setError(null);
    } catch (err) {
      presentError('画像の読み込みに失敗しました', err);
    }
  }, [imageToBase64, presentError]);

  const handleCheckboxChange = useCallback((imageId) => {
    setSelectedImageIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
      } else {
        newSet.add(imageId);
      }
      return newSet;
    });
  }, []);

  const handleBulkDownload = useCallback(async () => {
    if (selectedImageIds.size === 0) {
      setError('ダウンロードする画像を選択してください');
      return;
    }

    if (!Array.isArray(images)) {
      setError('画像データが正しくありません');
      return;
    }

    try {
      const zip = new JSZip();
      const exportFolder = zip.folder('exports');
      let index = 1;

      images
        .filter(img => img && img.id && selectedImageIds.has(img.id))
        .forEach(img => {
          try {
            // フルサイズ画像を優先、なければサムネイルを使用
            const imageUrl = img.fullImageUrl || img.imageUrl || img.thumbnailUrl;
            if (imageUrl) {
              const base64Data = imageUrl.split(',')[1];
              if (base64Data) {
                const fileName = img.title 
                  ? `${String(index).padStart(3, '0')}_${img.title.replace(/[^a-zA-Z0-9]/g, '_')}.png`
                  : `${String(index).padStart(3, '0')}.png`;
                exportFolder.file(fileName, base64Data, { base64: true });
              }
            }
            
            // プロンプトを追加
            const promptText = img.prompt || 'プロンプトなし';
            const promptFileName = img.title 
              ? `${String(index).padStart(3, '0')}_${img.title.replace(/[^a-zA-Z0-9]/g, '_')}_prompt.txt`
              : `${String(index).padStart(3, '0')}_prompt.txt`;
            exportFolder.file(promptFileName, promptText);
            
            index++;
          } catch (imgErr) {
            console.error(`画像 ${img.id} の処理に失敗しました:`, imgErr);
          }
        });

      if (index === 1) {
        setError('ダウンロード可能な画像が見つかりませんでした');
        return;
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, 'generated-images.zip');

      // 保存済みフラグを更新
      const updatedList = images
        .filter(img => img && selectedImageIds.has(img.id))
        .map(img => ({ ...img, saved: true }));
      setImages(prev => prev.map(img =>
        selectedImageIds.has(img.id)
          ? { ...img, saved: true }
          : img
      ));
      updatedList.forEach(saveImageHistory);
    } catch (err) {
      presentError('ダウンロードに失敗しました', err);
    }
  }, [selectedImageIds, images, setError, setImages, saveImageHistory, presentError]);

  // v5: スタイルをプロンプトに適用（旧実装、後方互換性のため残す）
  const handleStyleClick = (stylePrompt) => {
    if (prompt.trim()) {
      setPrompt(`${prompt}, ${stylePrompt}`);
    } else {
      setPrompt(stylePrompt);
    }
  };

  // YAMLを日本語に翻訳する関数
  const translateYamlToJapanese = async (yamlData) => {
    if (!yamlData || typeof yamlData !== 'object') {
      return '';
    }

    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      // APIキーがない場合は、簡易的な翻訳を返す
      return JSON.stringify(yamlData, null, 2);
    }

    setIsTranslatingYaml(true);
    try {
      const model = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini';
      
      const systemPrompt = `あなたは画像生成プロンプトのYAMLデータを日本語に翻訳する専門家です。
YAMLデータの構造を保持しながら、すべての英語のテキストを自然な日本語に翻訳してください。

**翻訳の原則:**
1. YAMLのキー名（例: "subject", "background", "style"）は日本語に翻訳してください
2. 値の内容も日本語に翻訳してください
3. 技術的なパラメータ（例: "--ar 3:4", "--style raw"）はそのまま保持してください
4. 色コード（例: "#1F242A"）や数値はそのまま保持してください
5. JSON形式で返してください（YAML形式ではなく）

**出力形式:**
翻訳されたYAMLデータをJSON形式で返してください。説明文やコメントは不要です。`;

      const userPrompt = `以下のYAMLデータを日本語に翻訳してください:\n${JSON.stringify(yamlData, null, 2)}`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' }
        }),
      });

      if (!response.ok) {
        throw new Error(`翻訳API呼び出しに失敗しました (${response.status})`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error('翻訳APIからの応答が空です');
      }

      const translated = JSON.parse(content);
      return JSON.stringify(translated, null, 2);
    } catch (err) {
      console.error('YAML翻訳エラー:', err);
      // エラー時は元のYAMLを返す
      return JSON.stringify(yamlData, null, 2);
    } finally {
      setIsTranslatingYaml(false);
    }
  };

  // スタイルをYAMLとして適用
  const handleApplyStyleAsYaml = async (style) => {
    let yamlData = null;
    
    // スタイルにYAMLデータがある場合はそれを使用
    if (style.yaml) {
      yamlData = style.yaml;
    } else if (style.prompt) {
      // promptフィールドがJSON文字列の場合はパース
      try {
        const parsed = JSON.parse(style.prompt);
        if (typeof parsed === 'object' && parsed !== null) {
          yamlData = parsed;
        } else {
          // 通常のプロンプト文字列の場合は、空のYAMLを作成
          yamlData = { prompt: style.prompt };
        }
      } catch (e) {
        // JSON解析に失敗した場合は、通常のプロンプト文字列として扱う
        yamlData = { prompt: style.prompt };
      }
    }

    if (yamlData) {
      setCurrentYamlData(yamlData);
      setYamlJsonText(JSON.stringify(yamlData, null, 2));
      setSelectedStyleId(style.id);
      
      // 日本語翻訳を非同期で実行
      translateYamlToJapanese(yamlData).then(translation => {
        setYamlJapaneseTranslation(translation);
      });
    }
  };

  // F-02: スタイルのトグル切り替え
  const toggleStyle = (styleId) => {
    setExpandedStyleIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(styleId)) {
        newSet.delete(styleId);
      } else {
        newSet.add(styleId);
      }
      return newSet;
    });
  };

  // F-07: 最終プロンプト構築
  const buildFinalPrompt = useMemo(() => {
    // 現在のYAMLデータからプロンプトを生成
    if (currentYamlData) {
      // PromptMakerコンポーネント内のgeneratePromptFromYaml関数と同じロジックを使用
      // ただし、ここでは簡易版を使用
      return generatePromptFromYaml(currentYamlData);
    }
    
    // 後方互換性のため、旧形式もサポート
    if (yamlInput.trim()) {
      try {
        const yamlObj = JSON.parse(yamlInput);
        return generatePromptFromYaml(yamlObj);
      } catch (e) {
        return yamlInput;
      }
    }
    
    // 従来の方式（後方互換性のため残す）
    const parts = [];
    
    // スタイル
    if (selectedStyleId) {
      const style = styles.find(s => s.id === selectedStyleId);
      if (style) parts.push(style.prompt);
    }
    
    // オブジェクト
    if (objectInputs.person) parts.push(objectInputs.person);
    if (objectInputs.background) parts.push(objectInputs.background);
    if (objectInputs.other) parts.push(objectInputs.other);
    
    // 既存のプロンプト入力がある場合は追加
    if (prompt.trim()) {
      parts.push(prompt);
    }
    
    return parts.join(', ');
  }, [currentYamlData, yamlInput, selectedStyleId, styles, objectInputs, prompt]);

  // YAMLからプロンプトを生成（ImageGeneratorコンポーネント用の簡易版）
  const generatePromptFromYaml = (yaml) => {
    if (!yaml || typeof yaml !== 'object') {
      return '';
    }

    const parts = [];
    
    // 再帰的にオブジェクトを走査してプロンプトを構築
    const traverse = (obj, prefix = '') => {
      if (obj === null || obj === undefined) {
        return;
      }

      if (Array.isArray(obj)) {
        obj.forEach((item) => {
          if (typeof item === 'string' && item.trim()) {
            parts.push(item.trim());
          } else if (typeof item === 'object' && item !== null) {
            traverse(item, prefix);
          }
        });
        return;
      }

      if (typeof obj !== 'object') {
        if (typeof obj === 'string' && obj.trim()) {
          parts.push(obj.trim());
        } else if (typeof obj === 'number' || typeof obj === 'boolean') {
          parts.push(String(obj));
        }
        return;
      }

      for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined || value === '') {
          continue;
        }

        if (key === 'format') {
          if (value.aspectRatio) parts.push(`--ar ${value.aspectRatio}`);
          if (value.style) parts.push(`--style ${value.style}`);
          if (value.quality) parts.push(`--quality ${value.quality}`);
          if (value.stylize) parts.push(`--stylize ${value.stylize}`);
        } else if (key === 'subject' && value.description) {
          parts.push(value.description);
        } else if (key === 'background' && value.description) {
          parts.push(`background: ${value.description}`);
        } else if (key === 'style' && value.description) {
          parts.push(value.description);
        } else if (key === 'mood' && value.description) {
          parts.push(`mood: ${value.description}`);
        } else if (typeof value === 'string' && value.trim()) {
          parts.push(value.trim());
        } else if (typeof value === 'object') {
          traverse(value, prefix ? `${prefix}.${key}` : key);
        }
      }
    };

    traverse(yaml);
    
    const uniqueParts = [...new Set(parts.filter(p => p && p.trim()))];
    return uniqueParts.join(', ');
  };

  // F-07: オブジェクト入力モードでの画像生成（YAMLデータを使用）
  const handleSubmitWithObjects = (e) => {
    e.preventDefault();
    
    // 現在のYAMLデータからプロンプトを生成
    if (!currentYamlData) {
      alert('YAMLデータがありません。スタイルライブラリからスタイルを適用してください。');
      return;
    }
    const finalPrompt = buildFinalPrompt;
    if (!finalPrompt.trim()) {
      setError('YAML形式でスタイル・人物・背景を入力するか、プロンプトを直接入力してください');
      return;
    }
    setPrompt(finalPrompt);
    // generateImageは既存のprompt stateを使用するので、setTimeoutで実行
    setTimeout(() => {
      generateImage();
    }, 0);
  };

  // ESCキーでクイックルックを閉じる
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && quickLookImage) {
        setQuickLookImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quickLookImage]);

  // F-06: 生成画像をスタイルのサムネとして追加
  const handleSetAsStyleThumbnail = (imageId) => {
    const image = images.find(img => img && img.id === imageId);
    if (!image) return;

    // スタイル選択モーダルを表示
    const styleIndex = window.prompt(
      `スタイルを選択してください（番号を入力）:\n${styles.map((s, i) => `${i + 1}. ${s.name}`).join('\n')}\n\n新規スタイルを作成する場合は「new」と入力`,
      ''
    );

    if (!styleIndex) return;

    let targetStyle;
    if (styleIndex.toLowerCase() === 'new') {
      // 新規スタイルを作成
      const styleName = window.prompt('新しいスタイル名を入力してください:');
      if (!styleName || !styleName.trim()) return;

      const stylePrompt = window.prompt('スタイルのプロンプトを入力してください:');
      if (!stylePrompt || !stylePrompt.trim()) return;

      targetStyle = {
        id: generateUUID(),
        name: styleName.trim(),
        prompt: stylePrompt.trim(),
        thumbnail: null,
        source: 'manual',
        createdAt: new Date().toISOString()
      };
    } else {
      // 既存スタイルを選択
      const index = parseInt(styleIndex) - 1;
      if (isNaN(index) || index < 0 || index >= styles.length) {
        alert('無効な選択です');
        return;
      }
      targetStyle = styles[index];
    }

    // サムネイルを生成（200x200px）
    requestThumbnailFromApi(image.fullImageUrl || image.imageUrl || image.thumbnailUrl, 200)
      .then(thumbnail => {
        const updatedStyle = {
          ...targetStyle,
          thumbnail: thumbnail
        };

        if (styleIndex.toLowerCase() === 'new') {
          // 新規スタイルを追加
          setStyles(prev => [...prev, updatedStyle]);
        } else {
          // 既存スタイルを更新
          setStyles(prev => prev.map(s =>
            s.id === targetStyle.id ? updatedStyle : s
          ));
        }

        saveStyle(updatedStyle).catch(err => {
          console.warn('スタイルの保存に失敗しました（サムネイルは設定されています）:', err);
        });

        alert('スタイルのサムネイルを設定しました！');
      })
      .catch(err => {
        presentError('サムネイルの設定に失敗しました', err);
      });
  };

  // v5: スタイルを追加
  const handleAddStyle = (e) => {
    e.preventDefault();
    if (!newStyleName.trim() || !newStylePrompt.trim()) {
      setError('スタイル名とプロンプトを入力してください');
      return;
    }

    const newStyle = {
      id: generateUUID(),
      name: newStyleName,
      prompt: newStylePrompt,
      thumbnail: null,
      source: 'manual',
      createdAt: new Date().toISOString()
    };

    setStyles(prev => [...prev, newStyle]);
    saveStyle(newStyle).catch(err => {
      console.warn('スタイルの保存に失敗しました（スタイルは追加されています）:', err);
    });
    setNewStyleName('');
    setNewStylePrompt('');
    setShowAddStyleForm(false);
  };

  // v5: スタイルを削除
  const handleDeleteStyle = (styleId) => {
    setStyles(prev => prev.filter(s => s.id !== styleId));
    deleteStyle(styleId);
  };

  // スタイルを編集開始
  const handleEditStyle = (styleId) => {
    const style = styles.find(s => s.id === styleId);
    if (style) {
      setEditingStyleId(styleId);
      setEditStyleName(style.name);
      setEditStylePrompt(style.prompt);
      setShowAddStyleForm(false); // 追加フォームを閉じる
    }
  };

  // スタイルを更新
  const handleUpdateStyle = (e) => {
    e.preventDefault();
    if (!editStyleName.trim() || !editStylePrompt.trim()) {
      setError('スタイル名とプロンプトを入力してください');
      return;
    }

    const targetStyle = styles.find(s => s.id === editingStyleId);
    const updatedStyle = targetStyle
      ? { ...targetStyle, name: editStyleName, prompt: editStylePrompt }
      : null;

    setStyles(prev => prev.map(s =>
      s.id === editingStyleId
        ? { ...s, name: editStyleName, prompt: editStylePrompt }
        : s
    ));
    setEditingStyleId(null);
    setEditStyleName('');
    setEditStylePrompt('');
    if (updatedStyle) {
      saveStyle(updatedStyle).catch(err => {
        console.warn('スタイルの保存に失敗しました（スタイルは更新されています）:', err);
      });
    }
  };

  // スタイル編集をキャンセル
  const handleCancelEditStyle = () => {
    setEditingStyleId(null);
    setEditStyleName('');
    setEditStylePrompt('');
  };

  const handleStyleCreatedFromPrompt = useCallback(async (style) => {
    // まずローカル状態に追加（即座に反映）
    setStyles(prev => {
      // 重複チェック（同じIDが既に存在する場合はスキップ）
      if (prev.find(s => s.id === style.id)) {
        console.warn('スタイルは既に存在します:', style.id);
        return prev;
      }
      return [...prev, style];
    });
    
    // データベースに保存を試みる
    try {
      await saveStyle(style);
      console.log('✅ スタイルライブラリに追加・保存成功:', style.name);
    } catch (err) {
      console.warn('⚠️ スタイルの保存に失敗しました（スタイルは追加されています）:', err);
      // エラーが発生しても、ローカル状態には追加されているので、ユーザーには通知しない
    }
  }, [saveStyle]);

  // 画像を削除
  const handleDeleteImage = async (imageId, e) => {
    e.stopPropagation(); // 親要素のクリックイベントを防ぐ
    if (window.confirm('この画像を削除しますか？')) {
      try {
        setImages(prev => {
          if (!Array.isArray(prev)) {
            console.warn('images状態が配列ではありません');
            return [];
          }
          return prev.filter(img => img && img.id !== imageId);
        });
        // 選択状態からも削除
        setSelectedImageIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(imageId);
          return newSet;
        });
        // 現在表示中の画像が削除された場合、currentImageIdをクリア
        if (currentImageId === imageId) {
          setCurrentImageId(null);
        }
        // クイックルック表示中の画像が削除された場合、クリア
        if (quickLookImage && quickLookImage.id === imageId) {
          setQuickLookImage(null);
        }
        await deleteImageHistory(imageId);
      } catch (err) {
        presentError('画像の削除に失敗しました', err);
      }
    }
  };

  // F-03: タイトル編集開始
  const handleStartEditTitle = useCallback((imageId, currentTitle) => {
    setEditingTitleId(imageId);
    setEditingTitle(currentTitle || '');
  }, []);

  // F-03: タイトル保存
  const handleSaveTitle = useCallback((imageId, newTitle) => {
    const title = newTitle !== undefined ? newTitle : editingTitle;
    const targetImage = images.find(img => img.id === imageId);
    const updatedImage = targetImage ? { ...targetImage, title } : null;
    setImages(prev => prev.map(img =>
      img.id === imageId
        ? { ...img, title }
        : img
    ));
    setEditingTitleId(null);
    setEditingTitle('');
    if (updatedImage) {
      saveImageHistory(updatedImage);
    }
  }, [images, editingTitle, saveImageHistory]);

  // タイトル編集キャンセル
  const handleCancelEditTitle = useCallback(() => {
    setEditingTitleId(null);
    setEditingTitle('');
  }, []);

  // F-04: クイックルック表示
  const handleShowQuickLook = useCallback((image) => {
    setQuickLookImage(image);
  }, []);

  // CSVファイルとしてダウンロードする関数
  const saveToCSV = async (image) => {
    try {
      // 使用したスタイル名を取得
      let styleName = '';
      if (selectedStyleId) {
        const style = styles.find(s => s.id === selectedStyleId);
        if (style) {
          styleName = style.name;
        }
      }

      // CSVデータを準備
      const registeredAt = new Date().toISOString();
      const createdAt = image.createdAt || new Date().toISOString();
      const title = image.title || '';
      const prompt = image.prompt || '';
      
      // 軽量化した画像データを取得（サムネイルを使用）
      let thumbnailBase64 = '';
      try {
        const imageUrl = image.thumbnailUrl || image.imageUrl || image.fullImageUrl;
        if (imageUrl) {
          // data:image/png;base64, の形式からBase64部分を抽出
          if (imageUrl.includes('base64,')) {
            thumbnailBase64 = imageUrl.split('base64,')[1];
          } else if (imageUrl.startsWith('data:')) {
            // data:image/png;base64, の形式でない場合は、そのまま使用
            thumbnailBase64 = imageUrl;
          } else {
            // URLの場合は、画像を読み込んでBase64に変換
            try {
              const response = await fetch(imageUrl);
              const blob = await response.blob();
              const reader = new FileReader();
              thumbnailBase64 = await new Promise((resolve, reject) => {
                reader.onloadend = () => {
                  const base64String = reader.result;
                  // data:image/png;base64, の形式からBase64部分を抽出
                  if (base64String.includes('base64,')) {
                    resolve(base64String.split('base64,')[1]);
                  } else {
                    resolve(base64String);
                  }
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            } catch (fetchErr) {
              console.warn('画像の読み込みに失敗しました。画像データなしでCSVを生成します:', fetchErr);
            }
          }
        }
      } catch (imgErr) {
        console.warn('画像データの処理に失敗しました。画像データなしでCSVを生成します:', imgErr);
      }
      
      // CSVヘッダー（画像データを含む）
      const csvHeader = '登録日時,作成日時,タイトル,スタイル名,プロンプト,画像データ(Base64)\n';
      
      // CSVデータ行（値にカンマや改行が含まれる場合はダブルクォートで囲む）
      const escapeCSV = (value) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };
      
      const csvRow = [
        escapeCSV(registeredAt),
        escapeCSV(createdAt),
        escapeCSV(title),
        escapeCSV(styleName),
        escapeCSV(prompt),
        escapeCSV(thumbnailBase64)
      ].join(',') + '\n';
      
      const csvContent = csvHeader + csvRow;
      
      // BOMを追加してExcelで正しく開けるようにする
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `image-history-${image.id}-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      
      console.log('✅ CSVファイルをダウンロードしました（画像データ含む）');
      return true;
    } catch (err) {
      console.error('❌ CSV保存エラー:', err);
      return false;
    }
  };


  // F-01: ダウンロード処理（フルサイズ画像を保存）
  const handleDownloadImage = async (imageId) => {
    const image = images.find(img => img && img.id === imageId);
    if (!image) return;

    const imageUrl = image.fullImageUrl || image.imageUrl || image.thumbnailUrl;
    if (!imageUrl) {
      setError('画像データが見つかりません');
      return;
    }

    try {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `generated-image-${image.id}-${image.title || 'untitled'}.png`;
      link.click();

      // 保存済みフラグを更新
      const updatedImage = { ...image, saved: true };
      setImages(prev => prev.map(img =>
        img.id === imageId
          ? { ...img, saved: true }
          : img
      ));
      saveImageHistory(updatedImage);
    } catch (err) {
      presentError('ダウンロードに失敗しました', err);
    }
  };

  const currentImage = currentImageId && Array.isArray(images) 
    ? images.find(img => img && img.id === currentImageId) 
    : null;

  return (
    <div className="image-generator">
      {/* ヘッダー（ユーザー情報とログアウト） */}
      <div className="app-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 20px',
        backgroundColor: '#f5f5f5',
        borderBottom: '1px solid #ddd',
        marginBottom: '20px'
      }}>
        <div style={{ fontSize: '14px', color: '#666' }}>
          ようこそ、<strong>{user?.username}</strong>さん
        </div>
        <button
          onClick={handleLogout}
          style={{
            padding: '8px 16px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'background-color 0.2s'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#c82333'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#dc3545'}
        >
          ログアウト
        </button>
      </div>

      {/* タブ切り替えUI */}
      <div className="app-mode-tabs">
        <button
          className={`tab-button ${appMode === 'image' ? 'active' : ''}`}
          onClick={() => setAppMode('image')}
        >
          🖼️ 画像生成モード
        </button>
        <button
          className={`tab-button ${appMode === 'prompt' ? 'active' : ''}`}
          onClick={() => setAppMode('prompt')}
        >
          📝 プロンプトモード
        </button>
      </div>

      {appMode === 'image' ? (
        <div className="image-generator-layout">
        {/* v5: 左サイドパネル（スタイルライブラリ） */}
        <div className="style-sidebar">
          <div className="style-sidebar-header">
            <h2>🎨 スタイルライブラリ</h2>
            <button
              onClick={() => setShowAddStyleForm(!showAddStyleForm)}
              className="add-style-button"
              style={{ marginTop: '0.5rem' }}
            >
              {showAddStyleForm ? 'キャンセル' : '+ 追加'}
            </button>
          </div>

          {showAddStyleForm && (
            <form onSubmit={handleAddStyle} className="add-style-form">
              <div className="form-group">
                <label htmlFor="style-name">スタイル名</label>
                <input
                  id="style-name"
                  type="text"
                  value={newStyleName}
                  onChange={(e) => setNewStyleName(e.target.value)}
                  placeholder="例: 和風アート"
                  className="style-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="style-prompt">プロンプト</label>
                <textarea
                  id="style-prompt"
                  value={newStylePrompt}
                  onChange={(e) => setNewStylePrompt(e.target.value)}
                  placeholder="例: 日本の伝統的な和風アートスタイル..."
                  rows={3}
                  className="style-textarea"
                />
              </div>
              <button type="submit" className="save-style-button">
                保存
              </button>
            </form>
          )}

          {editingStyleId && (
            <form onSubmit={handleUpdateStyle} className="add-style-form">
              <div className="form-group">
                <label htmlFor="edit-style-name">スタイル名</label>
                <input
                  id="edit-style-name"
                  type="text"
                  value={editStyleName}
                  onChange={(e) => setEditStyleName(e.target.value)}
                  placeholder="例: 和風アート"
                  className="style-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="edit-style-prompt">プロンプト</label>
                <textarea
                  id="edit-style-prompt"
                  value={editStylePrompt}
                  onChange={(e) => setEditStylePrompt(e.target.value)}
                  placeholder="例: 日本の伝統的な和風アートスタイル..."
                  rows={3}
                  className="style-textarea"
                />
              </div>
              <div className="edit-style-actions">
                <button type="submit" className="save-style-button">
                  更新
                </button>
                <button
                  type="button"
                  onClick={handleCancelEditStyle}
                  className="cancel-style-button"
                >
                  キャンセル
                </button>
              </div>
            </form>
          )}

          <div className="style-list">
            {styles.length === 0 ? (
              <p className="empty-styles">スタイルがありません</p>
            ) : (
              styles.map((style) => {
                const isExpanded = expandedStyleIds.has(style.id);
                return (
                  <div key={style.id} className="style-item">
                    <div 
                      className="style-item-header"
                      onClick={() => toggleStyle(style.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <span className="toggle-icon" style={{ marginRight: '8px' }}>
                        {isExpanded ? '▼' : '▶'}
                      </span>
                      <h3>{style.name}</h3>
                      <div className="style-item-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleEditStyle(style.id)}
                          className="edit-style-button"
                          title="編集"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteStyle(style.id)}
                          className="delete-style-button"
                          title="削除"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="style-item-content">
                        {style.thumbnail && (
                          <img 
                            src={style.thumbnail} 
                            alt={style.name} 
                            className="style-thumbnail"
                            style={{ maxWidth: '100%', marginBottom: '8px', borderRadius: '4px' }}
                          />
                        )}
                        <p className="style-prompt-preview" title={style.prompt}>
                          {style.prompt.length > 60 ? `${style.prompt.substring(0, 60)}...` : style.prompt}
                        </p>
                        <button
                          onClick={() => {
                            handleApplyStyleAsYaml(style);
                          }}
                          className="apply-style-button"
                        >
                          適用
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* メインコンテンツエリア */}
        <div className="image-generator-main">
          <div className="image-generator-container">
            <h1>画像生成アプリ</h1>
            <p className="subtitle">
              {mode === 'edit' 
                ? 'Gemini 2.5 Flash Image（画像編集）を使用した画像生成' 
                : 'Imagen 4（Google AI Studio）を使用した画像生成'}
            </p>

            {/* モード選択 */}
            <div className="mode-selector">
              <label className="mode-option">
                <input
                  type="radio"
                  name="mode"
                  value="new"
                  checked={mode === 'new'}
                  onChange={(e) => {
                    setMode(e.target.value);
                    setUploadedImage(null);
                  }}
                />
                <span>新規作成</span>
              </label>
              <label className="mode-option">
                <input
                  type="radio"
                  name="mode"
                  value="edit"
                  checked={mode === 'edit'}
                  onChange={(e) => setMode(e.target.value)}
                />
                <span>画像を修正</span>
              </label>
            </div>

            {/* v3: 画像アップロード */}
            <div 
              className={`upload-section ${mode === 'edit' ? 'edit-mode' : ''} ${isDraggingOver ? 'drag-over' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <label htmlFor="image-upload" className="upload-label">
                📷 画像をアップロード（編集用）
              </label>
              <input
                id="image-upload"
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="upload-input"
              />
              {uploadedImage && (
                <div className="uploaded-preview">
                  <p>✓ 画像がアップロードされました</p>
                  <small>プロンプトに「この画像を〇〇風にして」と指定できます</small>
                </div>
              )}
            </div>

            {/* YAML編集セクション */}
            <div className="yaml-editor-section">
              <div className="yaml-input-wrapper" style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label htmlFor="yaml-json-input" style={{ fontWeight: 'bold' }}>YAML</label>
                  <span style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                    yamlの入力は日本語でも可
                  </span>
                </div>
                <textarea
                  id="yaml-json-input"
                  value={yamlJsonText}
                  onChange={(e) => {
                    setYamlJsonText(e.target.value);
                    try {
                      const parsed = JSON.parse(e.target.value);
                      setCurrentYamlData(parsed);
                      // 日本語翻訳を更新（デバウンス処理）
                      clearTimeout(window.yamlTranslationTimeout);
                      window.yamlTranslationTimeout = setTimeout(() => {
                        translateYamlToJapanese(parsed).then(translation => {
                          setYamlJapaneseTranslation(translation);
                        });
                      }, 1000); // 1秒後に翻訳
                    } catch (err) {
                      // JSON解析エラーは無視（編集中のため）
                    }
                  }}
                  placeholder={`例:
{
  "subject": {
    "description": "adult Japanese woman holding a bouquet of flowers",
    "age": "成人",
    "gender": "女性"
  },
  "background": {
    "color": "plain white or very pale wash",
    "description": "2-3 broad abstract strokes"
  },
  "style": {
    "type": "watercolor",
    "aesthetic": "Japanese watercolor illustration"
  }
}`}
                  rows={15}
                  style={{ 
                    width: '100%', 
                    padding: '12px', 
                    marginTop: '4px',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    resize: 'vertical'
                  }}
                  disabled={loading}
                />
              </div>

              {/* 日本語訳セクション */}
              <div className="yaml-translation-section" style={{ marginBottom: '16px' }}>
                <label htmlFor="yaml-japanese-translation" style={{ fontWeight: 'bold' }}>YAML（日本語訳）</label>
                {isTranslatingYaml ? (
                  <div style={{ padding: '12px', textAlign: 'center', color: '#666' }}>
                    翻訳中...
                  </div>
                ) : (
                  <textarea
                    id="yaml-japanese-translation"
                    value={yamlJapaneseTranslation}
                    readOnly
                    rows={15}
                    style={{ 
                      width: '100%', 
                      padding: '12px', 
                      marginTop: '4px',
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      lineHeight: '1.6',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      backgroundColor: '#f9f9f9',
                      resize: 'vertical'
                    }}
                  />
                )}
              </div>
            </div>

            <form onSubmit={handleSubmitWithObjects} className="prompt-form">
              <button
                type="submit"
                className="generate-button"
                disabled={loading || !currentYamlData}
              >
                {loading ? '生成中...' : '画像を生成'}
              </button>
            </form>

            {error && (
              <div className="error-message">
                <p>⚠️ {error}</p>
              </div>
            )}

            {loading && (
              <div className="loading">
                <div className="spinner"></div>
                <p>画像を生成しています...</p>
              </div>
            )}

            {currentImage && !loading && (currentImage.fullImageUrl || currentImage.imageUrl || currentImage.thumbnailUrl) && (
              <div className="image-result">
                <h2>生成された画像</h2>
                <div className="image-wrapper">
                  <img 
                    src={currentImage.fullImageUrl || currentImage.imageUrl || currentImage.thumbnailUrl} 
                    alt="Generated" 
                    onError={() => {
                      presentError('画像の表示に失敗しました', currentImage);
                    }}
                  />
                </div>
                <div className="image-actions">
                  <button
                    onClick={() => handleDownloadImage(currentImage.id)}
                    className="download-button"
                  >
                    💾 画像をダウンロード
                  </button>
                  <button
                    onClick={() => saveToCSV(currentImage)}
                    className="download-button"
                    style={{ marginLeft: '8px' }}
                    title="画像情報をCSVファイルとしてダウンロード"
                  >
                    📄 CSVで保存
                  </button>
                  {/* v2: 再生成ボタン */}
                  <button
                    onClick={handleRegenerate}
                    className="regenerate-button"
                  >
                    🔄 再生成
                  </button>
                </div>

                {/* v2: 再生成フォーム */}
                {showRegenerateForm && (
                  <form onSubmit={handleRegenerateSubmit} className="regenerate-form">
                    <div className="form-group">
                      <label htmlFor="regeneratePrompt">新しいプロンプトを入力</label>
                      <textarea
                        id="regeneratePrompt"
                        name="regeneratePrompt"
                        placeholder="例: より明るい色調で、より詳細に..."
                        rows={3}
                        disabled={loading}
                      />
                    </div>
                    <div className="regenerate-form-actions">
                      <button type="submit" className="generate-button" disabled={loading}>
                        再生成
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRegenerateForm(false)}
                        className="cancel-button"
                      >
                        キャンセル
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* v6: 注意書き・法務ガイド */}
          <div className="legal-notice">
            <p><strong>⚠️ 注意事項:</strong></p>
            <p>生成される画像やプロンプトは、他者の著作権・肖像権を侵害しないようご利用ください。</p>
            <p>本アプリでは、作成したプロンプトと画像を一緒に記録・保管することを推奨します。</p>
          </div>
        </div>

        {/* v4: 右サイドパネル（履歴一覧） */}
        <div className="image-generator-sidebar">
          <div className="sidebar-header">
            <h2>🖼️ 生成画像一覧</h2>
            {selectedImageIds.size > 0 && (
              <button onClick={handleBulkDownload} className="bulk-download-button">
                📦 選択した画像を保存 ({selectedImageIds.size})
              </button>
            )}
          </div>

          <div className="image-history">
            {images.length === 0 ? (
              <p className="empty-history">まだ画像が生成されていません</p>
            ) : (
              reversedImages.map((img) => (
                <HistoryItem
                  key={`${img.id}-${img.revision}`}
                  image={img}
                  isActive={currentImageId === img.id}
                  isSelected={selectedImageIds.has(img.id)}
                  editingTitleId={editingTitleId}
                  editingTitle={editingTitle}
                  onCheckboxChange={handleCheckboxChange}
                  onImageClick={setCurrentImageId}
                  onDeleteImage={handleDeleteImage}
                  onStartEditTitle={handleStartEditTitle}
                  onSaveTitle={handleSaveTitle}
                  onCancelEditTitle={handleCancelEditTitle}
                  onTitleChange={setEditingTitle}
                  onDragStart={handleDragStart}
                  onShowQuickLook={handleShowQuickLook}
                />
              ))
            )}
            {hasMoreHistory && (
              <button
                type="button"
                className="load-more-button"
                onClick={() => loadHistories()}
                disabled={historyLoading}
                style={{ marginTop: '12px' }}
              >
                {historyLoading ? '読み込み中...' : 'さらに読み込む'}
              </button>
            )}
            
            {/* 画像履歴アーカイブへのリンク */}
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f0f4ff', borderRadius: '8px', border: '1px solid #667eea' }}>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#333' }}>
                <strong>📋 画像生成履歴アーカイブ</strong>
              </p>
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#666', lineHeight: '1.5' }}>
                生成した画像とプロンプト、作成日時を表形式で確認できます。画像を削除しても、このアーカイブには残ります。
              </p>
              <button
                onClick={() => navigate('/image-history')}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                  transition: 'background 0.2s'
                }}
                onMouseOver={(e) => e.target.style.background = '#5568d3'}
                onMouseOut={(e) => e.target.style.background = '#667eea'}
              >
                📋 履歴アーカイブを開く
              </button>
            </div>
          </div>
        </div>
      </div>
      ) : (
        <PromptMaker onStyleCreated={handleStyleCreatedFromPrompt} />
      )}

      {/* F-04: クイックルックモーダル */}
      {quickLookImage && (
        <div 
          className="quick-look-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setQuickLookImage(null);
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div 
            className="quick-look-content"
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '20px',
              maxWidth: '90vw',
              maxHeight: '90vh',
              overflow: 'auto',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              className="close-button"
              onClick={() => setQuickLookImage(null)}
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                zIndex: 1001
              }}
            >
              ×
            </button>
            <img 
              src={quickLookImage.fullImageUrl || quickLookImage.imageUrl || quickLookImage.thumbnailUrl} 
              alt={quickLookImage.title || 'Generated'} 
              style={{
                maxWidth: '100%',
                height: 'auto',
                marginBottom: '16px'
              }}
            />
            <div className="quick-look-info">
              <h3 style={{ marginBottom: '8px' }}>
                {quickLookImage.title || `画像 ${new Date(quickLookImage.createdAt).toLocaleString('ja-JP')}`}
              </h3>
              <p className="prompt" style={{ marginBottom: '8px', fontSize: '14px', color: '#666' }}>
                <strong>プロンプト:</strong> {quickLookImage.prompt}
              </p>
              <p className="date" style={{ marginBottom: '16px', fontSize: '12px', color: '#999' }}>
                {new Date(quickLookImage.createdAt).toLocaleString('ja-JP')}
                {quickLookImage.revision > 0 && ` (v${quickLookImage.revision + 1})`}
              </p>
              <div className="quick-look-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button 
                  onClick={() => {
                    handleDownloadImage(quickLookImage.id);
                  }}
                  className="download-button"
                  style={{ padding: '8px 16px' }}
                >
                  💾 ダウンロード
                </button>
                <button 
                  onClick={() => {
                    const image = images.find(img => img && img.id === quickLookImage.id);
                    if (image) {
                      saveToCSV(image);
                    }
                  }}
                  className="download-button"
                  style={{ padding: '8px 16px' }}
                  title="画像情報をCSVファイルとしてダウンロード"
                >
                  📄 CSVで保存
                </button>
                <button 
                  onClick={() => {
                    setCurrentImageId(quickLookImage.id);
                    handleRegenerate();
                    setQuickLookImage(null);
                  }}
                  className="regenerate-button"
                  style={{ padding: '8px 16px' }}
                >
                  🔄 再生成
                </button>
                {/* F-06: スタイルのサムネとして使用 */}
                <button 
                  onClick={() => {
                    handleSetAsStyleThumbnail(quickLookImage.id);
                    setQuickLookImage(null);
                  }}
                  className="set-thumbnail-button"
                  style={{ padding: '8px 16px' }}
                >
                  🖼️ スタイルのサムネとして使用
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default ImageGenerator;
