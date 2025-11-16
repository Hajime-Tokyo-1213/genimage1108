import React, { useState, useEffect, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { useAuth } from './contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './ImageGenerator.css';
import { supabase, requireSession } from './lib/supabaseClient.js';
import { persistImageHistory, removeImageHistory, persistImageArchive } from './lib/authService.js';

const HISTORY_PAGE_SIZE = 10;

// UUID v4を生成する関数（共通）
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const createDefaultStyles = () => ([
  { id: '1', name: '和風アート', prompt: '日本の伝統的な和風アートスタイル、浮世絵風、美しい色彩', thumbnail: null, source: 'manual', createdAt: new Date().toISOString() },
  { id: '2', name: '未来都市', prompt: '未来の都市、サイバーパンク、ネオンライト、高層ビル', thumbnail: null, source: 'manual', createdAt: new Date().toISOString() },
  { id: '3', name: 'ファンタジー', prompt: 'ファンタジー世界、魔法、幻想的な風景、エピックな構図', thumbnail: null, source: 'manual', createdAt: new Date().toISOString() },
  { id: '4', name: '水彩画', prompt: '水彩画スタイル、柔らかい色合い、繊細な筆使い', thumbnail: null, source: 'manual', createdAt: new Date().toISOString() },
]);

const ImageGenerator = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState([]); // v2: 配列化
  const [currentImageId, setCurrentImageId] = useState(null); // 現在表示中の画像ID
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedImageIds, setSelectedImageIds] = useState(new Set()); // v4: 選択された画像ID
  const [uploadedImage, setUploadedImage] = useState(null); // v3: アップロード画像
  const [showRegenerateForm, setShowRegenerateForm] = useState(false); // v2: 再生成フォーム表示
  const [styles, setStyles] = useState([]); // v5: プリセットスタイル
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
  const [historyPage, setHistoryPage] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const base64CacheRef = useRef(new Map());

  const presentError = useCallback((message, detail) => {
    console.error(message, detail);
    setError(message);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  const syncImageRecord = useCallback(async (image) => {
    if (!user?.id) return;
    try {
      await persistImageHistory(image, supabase);
    } catch (err) {
      console.error('画像履歴の保存に失敗しました:', {
        error: err,
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code,
        image: {
          id: image?.id,
          prompt: image?.prompt?.substring(0, 50) + '...',
          hasThumbnail: !!image?.thumbnailUrl,
          hasFullImage: !!image?.fullImageUrl
        }
      });
      const errorMessage = err?.message || err?.details || '画像履歴の保存に失敗しました';
      presentError(`画像履歴の保存に失敗しました: ${errorMessage}`, err);
      // エラーを再スローして、呼び出し元で処理できるようにする
      throw err;
    }
  }, [user?.id, presentError]);

  const deleteImageRecord = useCallback(async (imageId) => {
    if (!user?.id) return;
    try {
      await removeImageHistory(imageId, supabase);
    } catch (err) {
      presentError('画像履歴の削除に失敗しました', err);
    }
  }, [user?.id, presentError]);

  const syncStyleRecord = useCallback(async (style) => {
    if (!user?.id) return;
    try {
      await requireSession(supabase);
      console.log('🔍 スタイル保存リクエスト:', {
        id: style.id,
        user_id: user.id,
        name: style.name,
        prompt_length: style.prompt?.length || 0,
        has_thumbnail: !!style.thumbnail,
        source: style.source
      });
      
      const { data, error } = await supabase
        .from('image_styles')
        .upsert({
          id: style.id,
          user_id: user.id,
          name: style.name,
          prompt: style.prompt,
          thumbnail: style.thumbnail || null,
          source: style.source || 'manual',
          created_at: style.createdAt || new Date().toISOString(),
        }, { onConflict: 'id' });
      
      if (error) {
        console.error('❌ スタイル保存エラー:', {
          error: error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          style: {
            id: style.id,
            name: style.name,
            prompt: style.prompt?.substring(0, 50) + '...'
          }
        });
        throw error;
      }
      
      console.log('✅ スタイル保存成功:', data);
    } catch (err) {
      const errorMessage = err?.message || err?.details || 'スタイルの保存に失敗しました';
      presentError(`スタイルの保存に失敗しました: ${errorMessage}`, err);
      throw err; // エラーを再スロー
    }
  }, [user?.id, presentError]);

  const deleteStyleRecord = useCallback(async (styleId) => {
    if (!user?.id) return;
    try {
      await requireSession(supabase);
      const { error } = await supabase
        .from('image_styles')
        .delete()
        .eq('id', styleId)
        .eq('user_id', user.id);
      if (error) {
        throw error;
      }
    } catch (err) {
      presentError('スタイルの削除に失敗しました', err);
    }
  }, [user?.id, presentError]);


  const loadStyles = useCallback(async () => {
    if (!user?.id) {
      setStyles(createDefaultStyles());
      return;
    }
    try {
      await requireSession(supabase);
      const { data, error } = await supabase
        .from('image_styles')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        throw error;
      }
      if (Array.isArray(data) && data.length > 0) {
        setStyles(data.map(row => {
          // promptフィールドがJSON文字列の場合はYAMLオブジェクトとして復元
          let yaml = null;
          let prompt = row.prompt;
          try {
            const parsed = JSON.parse(row.prompt);
            if (typeof parsed === 'object' && parsed !== null) {
              yaml = parsed;
              // YAMLデータの場合は、promptフィールドにJSON文字列をそのまま保持
              // プロンプト文字列が必要な場合は、使用時に生成する
            }
          } catch (e) {
            // JSON解析に失敗した場合は通常のプロンプト文字列として扱う
          }
          
          return {
            id: row.id,
            name: row.name,
            prompt: prompt, // JSON文字列または通常のプロンプト文字列
            yaml: yaml, // YAMLデータがあれば保持（オブジェクト形式）
            thumbnail: row.thumbnail || null,
            source: row.source || 'manual',
            createdAt: row.created_at,
          };
        }));
      } else {
        setStyles(createDefaultStyles());
      }
    } catch (err) {
      // エラーが発生した場合は無限ループを防ぐため、エラーを表示するだけ
      console.error('スタイルの読み込みエラー:', err);
      presentError('スタイルの読み込みに失敗しました', err);
      setStyles(createDefaultStyles());
      // エラー時はリトライしない
    }
  }, [user?.id, presentError]);

  const loadHistories = useCallback(async ({ reset = false } = {}) => {
    if (!user?.id) {
      setImages([]);
      setHasMoreHistory(false);
      return;
    }
    setHistoryLoading(true);
    try {
      await requireSession(supabase);
      // resetの場合は常に0から開始、そうでない場合は現在のhistoryPageを使用
      const currentPage = reset ? 0 : historyPage;
      const from = currentPage * HISTORY_PAGE_SIZE;
      const to = from + HISTORY_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('image_histories')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) {
        throw error;
      }
      const normalized = Array.isArray(data)
        ? data.map(row => ({
            id: row.id,
            prompt: row.prompt,
            thumbnailUrl: row.thumbnail_url,
            // フルサイズ画像も復元（full_image_urlカラムが存在する場合）
            fullImageUrl: row.full_image_url || null,
            createdAt: row.created_at,
            revision: row.revision || 0,
            title: row.title || '',
            saved: row.saved || false,
          }))
        : [];
      setImages(prev => {
        const next = reset ? [] : [...prev];
        normalized.forEach(item => {
          if (!next.find(existing => existing.id === item.id)) {
            next.push(item);
          }
        });
        return next.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      });
      // resetの場合は1に設定、そうでない場合は次のページに進む
      if (reset) {
        setHistoryPage(1);
      } else {
        setHistoryPage(prev => prev + 1);
      }
      setHasMoreHistory(normalized.length === HISTORY_PAGE_SIZE);
    } catch (err) {
      // エラーが発生した場合は無限ループを防ぐため、エラーを表示するだけ
      console.error('履歴の読み込みエラー:', err);
      presentError('履歴の読み込みに失敗しました', err);
      // エラー時はリトライしない
    } finally {
      setHistoryLoading(false);
    }
  }, [user?.id, historyPage, presentError]);

  useEffect(() => {
    if (!user?.id) {
      setImages([]);
      setStyles(createDefaultStyles());
      setHistoryPage(0);
      setHasMoreHistory(false);
      return;
    }
    // 無限ループを防ぐため、依存配列から関数を削除し、直接呼び出す
    let isMounted = true;
    
    const fetchData = async () => {
      setHistoryPage(0);
      setHasMoreHistory(false);
      if (isMounted) {
        await loadStyles();
        await loadHistories({ reset: true });
      }
    };
    
    fetchData();
    
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // loadStylesとloadHistoriesを依存配列から削除

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
  const handleDragStart = (e, imageId) => {
    e.dataTransfer.setData('imageId', imageId);
    e.dataTransfer.effectAllowed = 'move';
  };

  // ドラッグオーバー
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDraggingOver(true);
  };

  // ドラッグリーブ
  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  // ドロップ
  const handleDrop = async (e) => {
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
  };

  const generateImage = async (regenerateId = null, newPrompt = null) => {
    // F-07: オブジェクト入力がある場合はbuildFinalPromptを使用
    const finalPrompt = buildFinalPrompt();
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
          await syncImageRecord(newImage);
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
      const errorMessage = err.message || 'エラーが発生しました';
      presentError(errorMessage, err);
    } finally {
      // エラーが発生しても必ずローディング状態を解除
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    generateImage();
  };

  const handleRegenerate = () => {
    setShowRegenerateForm(true);
  };

  const handleRegenerateSubmit = (e) => {
    e.preventDefault();
    const regeneratePrompt = e.target.regeneratePrompt.value;
    if (currentImageId) {
      generateImage(currentImageId, regeneratePrompt);
    }
  };

  const handleFileUpload = async (e) => {
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
  };

  const handleCheckboxChange = (imageId) => {
    setSelectedImageIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
      } else {
        newSet.add(imageId);
      }
      return newSet;
    });
  };

  const handleBulkDownload = async () => {
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
      updatedList.forEach(syncImageRecord);
    } catch (err) {
      presentError('ダウンロードに失敗しました', err);
    }
  };

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
  const buildFinalPrompt = () => {
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
  };

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
    const finalPrompt = buildFinalPrompt();
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

        syncStyleRecord(updatedStyle).catch(err => {
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
    syncStyleRecord(newStyle).catch(err => {
      console.warn('スタイルの保存に失敗しました（スタイルは追加されています）:', err);
    });
    setNewStyleName('');
    setNewStylePrompt('');
    setShowAddStyleForm(false);
  };

  // v5: スタイルを削除
  const handleDeleteStyle = (styleId) => {
    setStyles(prev => prev.filter(s => s.id !== styleId));
    deleteStyleRecord(styleId);
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
      syncStyleRecord(updatedStyle).catch(err => {
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
      await syncStyleRecord(style);
      console.log('✅ スタイルライブラリに追加・保存成功:', style.name);
    } catch (err) {
      console.warn('⚠️ スタイルの保存に失敗しました（スタイルは追加されています）:', err);
      // エラーが発生しても、ローカル状態には追加されているので、ユーザーには通知しない
    }
  }, [syncStyleRecord]);

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
        await deleteImageRecord(imageId);
      } catch (err) {
        presentError('画像の削除に失敗しました', err);
      }
    }
  };

  // F-03: タイトル編集開始
  const handleStartEditTitle = (imageId, currentTitle) => {
    setEditingTitleId(imageId);
    setEditingTitle(currentTitle || '');
  };

  // F-03: タイトル保存
  const handleSaveTitle = (imageId) => {
    const targetImage = images.find(img => img.id === imageId);
    const updatedImage = targetImage ? { ...targetImage, title: editingTitle } : null;
    setImages(prev => prev.map(img =>
      img.id === imageId
        ? { ...img, title: editingTitle }
        : img
    ));
    setEditingTitleId(null);
    setEditingTitle('');
    if (updatedImage) {
      syncImageRecord(updatedImage);
    }
  };

  // F-04: クイックルック表示
  const handleShowQuickLook = (imageId) => {
    const image = images.find(img => img && img.id === imageId);
    if (image) {
      setQuickLookImage(image);
    }
  };

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
      syncImageRecord(updatedImage);
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
              [...images].reverse().map((img) => (
                <div
                  key={`${img.id}-${img.revision}`}
                  className={`history-item ${currentImageId === img.id ? 'active' : ''}`}
                >
                  <div className="history-item-header">
                    <input
                      type="checkbox"
                      checked={selectedImageIds.has(img.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleCheckboxChange(img.id);
                      }}
                      className="history-checkbox"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="history-date">
                      {new Date(img.createdAt).toLocaleString('ja-JP')}
                      {img.revision > 0 && <span className="revision-badge">v{img.revision + 1}</span>}
                    </span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteImage(img.id, e);
                      }}
                      className="delete-image-button"
                      title="削除"
                      type="button"
                      style={{ cursor: 'pointer', zIndex: 10 }}
                    >
                      ×
                    </button>
                  </div>
                  {/* F-03: タイトル編集 */}
                  <div className="history-item-title" style={{ marginBottom: '8px' }}>
                    {editingTitleId === img.id ? (
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => handleSaveTitle(img.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveTitle(img.id);
                          }
                          if (e.key === 'Escape') {
                            setEditingTitleId(null);
                            setEditingTitle('');
                          }
                        }}
                        autoFocus
                        style={{ width: '100%', padding: '4px', fontSize: '12px' }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEditTitle(img.id, img.title || '');
                        }}
                        style={{ 
                          cursor: 'pointer', 
                          fontSize: '12px',
                          fontWeight: 'bold',
                          display: 'block',
                          padding: '4px'
                        }}
                        title="クリックしてタイトルを編集"
                      >
                        {img.title || `画像 ${new Date(img.createdAt).toLocaleString('ja-JP')}`}
                      </span>
                    )}
                  </div>
                  <div 
                    className="history-image-wrapper" 
                    title={img.prompt}
                    draggable
                    onDragStart={(e) => handleDragStart(e, img.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShowQuickLook(img.id);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <img 
                      src={img.thumbnailUrl || img.imageUrl} 
                      alt="History" 
                      onError={(e) => {
                        console.error('履歴画像の読み込みエラー:', img);
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                  <p className="history-prompt" title={img.prompt || ''} style={{ fontSize: '11px', marginTop: '4px' }}>
                    {img.prompt && img.prompt.length > 50 ? `${img.prompt.substring(0, 50)}...` : (img.prompt || 'プロンプトなし')}
                  </p>
                  <div 
                    className="history-item-actions" 
                    style={{ marginTop: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDownloadImage(img.id);
                      }}
                      className="download-button"
                      style={{ fontSize: '11px', padding: '4px 8px', cursor: 'pointer', zIndex: 10 }}
                      title="ダウンロード"
                      type="button"
                    >
                      💾
                    </button>
                    {/* F-06: スタイルのサムネとして使用 */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSetAsStyleThumbnail(img.id);
                      }}
                      className="set-thumbnail-button"
                      style={{ fontSize: '11px', padding: '4px 8px', cursor: 'pointer', zIndex: 10 }}
                      title="スタイルのサムネとして使用"
                      type="button"
                    >
                      🖼️
                    </button>
                  </div>
                </div>
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

// プロンプトモードコンポーネント
const PromptMaker = ({ onStyleCreated = () => {} }) => {
  const { user } = useAuth();
  const [masterPrompt, setMasterPrompt] = useState('');
  const [yamlData, setYamlData] = useState(null);
  const [selectedField, setSelectedField] = useState(null);
  const [inputMode, setInputMode] = useState('select'); // 'select' | 'text'
  const [templates, setTemplates] = useState([]);
  const [currentTemplate, setCurrentTemplate] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [isParsing, setIsParsing] = useState(false); // プロンプト解析中のローディング状態
  const [parseError, setParseError] = useState(null); // 解析エラー
  const [templateError, setTemplateError] = useState(null);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0); // 選択肢モード内での選択インデックス
  const [currentMode, setCurrentMode] = useState('field'); // 'field' | 'select' | 'text' - 現在のモード
  const [isEditingYaml, setIsEditingYaml] = useState(false); // YAML編集モード
  const [editingYamlText, setEditingYamlText] = useState(''); // 編集中のYAMLテキスト
  const [fieldOptions, setFieldOptions] = useState({}); // フィールドごとの選択肢 { fieldPath: [options] }
  const [isGeneratingOptions, setIsGeneratingOptions] = useState(false); // AI選択肢生成中
  const [isEditingOptions, setIsEditingOptions] = useState(false); // 選択肢編集モード
  const [editingOptionsText, setEditingOptionsText] = useState(''); // 編集中の選択肢テキスト
  const surfaceTemplateError = useCallback((message, detail) => {
    console.error(message, detail);
    setTemplateError(message);
  }, []);

  const persistTemplate = useCallback(async (template) => {
    if (!user?.id) return;
    try {
      await requireSession(supabase);
      const payload = {
        id: template.id,
        user_id: user.id,
        name: template.name,
        yaml: template.yaml || {},
        original_prompt: template.originalPrompt || '',
        field_options: template.fieldOptions || {},
        created_at: template.createdAt || new Date().toISOString(),
      };
      
      console.log('🔍 テンプレート保存リクエスト:', payload);
      
      const { data, error } = await supabase
        .from('prompt_templates')
        .upsert(payload, { onConflict: 'id' });
      
      if (error) {
        console.error('❌ テンプレート保存エラー詳細:', {
          error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }
      
      console.log('✅ テンプレート保存成功:', data);
      setTemplateError(null);
    } catch (err) {
      console.error('テンプレート保存エラー:', err);
      const errorMessage = err?.message || err?.details || 'テンプレートの保存に失敗しました';
      surfaceTemplateError(`テンプレートの保存に失敗しました: ${errorMessage}`, err);
    }
  }, [user?.id, surfaceTemplateError]);

  const deleteTemplate = useCallback(async (templateId) => {
    if (!user?.id) return;
    if (!window.confirm('このテンプレートを削除しますか？')) return;
    
    try {
      await requireSession(supabase);
      const { error } = await supabase
        .from('prompt_templates')
        .delete()
        .eq('id', templateId)
        .eq('user_id', user.id);
      
      if (error) {
        console.error('❌ テンプレート削除エラー:', {
          error: error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }
      
      // ローカル状態からも削除
      setTemplates(prev => prev.filter(t => t.id !== templateId));
      
      // 現在のテンプレートが削除された場合はクリア
      if (currentTemplate?.id === templateId) {
        setCurrentTemplate(null);
        setYamlData(null);
        setMasterPrompt('');
        setFieldOptions({});
      }
      
      console.log('✅ テンプレート削除成功');
    } catch (err) {
      const errorMessage = err?.message || err?.details || 'テンプレートの削除に失敗しました';
      surfaceTemplateError(`テンプレートの削除に失敗しました: ${errorMessage}`, err);
    }
  }, [user?.id, currentTemplate, surfaceTemplateError]);

  useEffect(() => {
    if (!user?.id) {
      setTemplates([]);
      setTemplateError(null);
      return;
    }

    let active = true;

    const fetchTemplates = async () => {
      try {
        await requireSession(supabase);
        const { data, error } = await supabase
          .from('prompt_templates')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (error) {
          throw error;
        }
        if (!active) return;
        setTemplates(Array.isArray(data)
          ? data.map(row => ({
              id: row.id,
              name: row.name,
              yaml: row.yaml || {},
              originalPrompt: row.original_prompt || '',
              fieldOptions: row.field_options || {},
              createdAt: row.created_at,
            }))
          : []);
        setTemplateError(null);
      } catch (err) {
        if (!active) return;
        surfaceTemplateError('テンプレートの取得に失敗しました', err);
      }
    };

    fetchTemplates();

    return () => {
      active = false;
    };
  }, [user?.id, surfaceTemplateError]);

  // YAMLフィールドを取得
  const getYamlFields = (yaml) => {
    const fields = [];
    const traverse = (obj, path = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          traverse(value, currentPath);
        } else {
          fields.push({ path: currentPath, value, key });
        }
      }
    };
    traverse(yaml);
    return fields;
  };

  // 選択肢を取得
  const getOptions = (fieldPath) => {
    // フィールドごとに保存された選択肢があればそれを返す
    if (fieldOptions[fieldPath] && fieldOptions[fieldPath].length > 0) {
      return fieldOptions[fieldPath];
    }
    // デフォルト選択肢
    const defaultOptions = ['Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Pink', 'Black', 'White'];
    return defaultOptions;
  };

  // AIで選択肢を生成
  const generateOptionsWithAI = async (fieldPath) => {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      alert('OpenAI APIキーが設定されていません。.env に VITE_OPENAI_API_KEY=... を設定してください。');
      return;
    }

    setIsGeneratingOptions(true);
    try {
      const field = getYamlFields(yamlData).find(f => f.path === fieldPath);
      const fieldName = field?.key || fieldPath.split('.').pop();
      const currentValue = field?.value || '';

      const systemPrompt = `あなたは画像生成プロンプトの選択肢を生成する専門家です。
フィールド名と現在の値に基づいて、適切な選択肢を10個程度生成してください。
選択肢はJSON配列形式で返してください。説明文は不要です。

例:
["選択肢1", "選択肢2", "選択肢3", ...]`;

      const userPrompt = `フィールド名: ${fieldName}
フィールドパス: ${fieldPath}
現在の値: ${currentValue}
YAML構造: ${JSON.stringify(yamlData, null, 2)}

このフィールドに適した選択肢を10個程度生成してください。`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API呼び出しに失敗しました (${response.status})`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error('APIからの応答が空です');
      }

      // JSONをパース
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        // JSON形式でない場合は、配列として直接パースを試みる
        const arrayMatch = content.match(/\[.*\]/s);
        if (arrayMatch) {
          parsed = JSON.parse(arrayMatch[0]);
        } else {
          throw new Error('応答がJSON形式ではありません');
        }
      }

      // 選択肢を抽出（配列またはオブジェクトから）
      let options = [];
      if (Array.isArray(parsed)) {
        options = parsed;
      } else if (parsed.options && Array.isArray(parsed.options)) {
        options = parsed.options;
      } else if (parsed.choices && Array.isArray(parsed.choices)) {
        options = parsed.choices;
      } else {
        // オブジェクトの値から配列を探す
        const values = Object.values(parsed);
        const arrayValue = values.find(v => Array.isArray(v));
        if (arrayValue) {
          options = arrayValue;
        }
      }

      if (options.length === 0) {
        throw new Error('選択肢が見つかりませんでした');
      }

      // 選択肢を保存
      setFieldOptions(prev => ({
        ...prev,
        [fieldPath]: options
      }));

      alert(`${options.length}個の選択肢を生成しました！`);
    } catch (err) {
      console.error('AI選択肢生成エラー:', err);
      alert(`選択肢の生成に失敗しました: ${err.message}`);
    } finally {
      setIsGeneratingOptions(false);
    }
  };

  // 選択肢を手動で編集
  const handleEditOptions = (fieldPath) => {
    const currentOptions = getOptions(fieldPath);
    setEditingOptionsText(currentOptions.join('\n'));
    setIsEditingOptions(fieldPath);
  };

  // 選択肢を保存
  const handleSaveOptions = (fieldPath) => {
    const options = editingOptionsText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    if (options.length === 0) {
      alert('選択肢を入力してください');
      return;
    }

    setFieldOptions(prev => ({
      ...prev,
      [fieldPath]: options
    }));
    setIsEditingOptions(false);
    setEditingOptionsText('');
    alert('選択肢を保存しました！');
  };

  // 選択肢編集をキャンセル
  const handleCancelEditOptions = () => {
    setIsEditingOptions(false);
    setEditingOptionsText('');
  };

  // キーボード操作
  useEffect(() => {
    if (!yamlData) return;

    const handleKeyDown = (e) => {
      // 入力フィールドにフォーカスがある場合は無視（ただしシフトキーは有効）
      if ((e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') && !e.shiftKey) {
        return;
      }

      const isShift = e.shiftKey;

      if (e.key === 'ArrowUp' && !isShift) {
        e.preventDefault();
        if (currentMode === 'field') {
          const fields = getYamlFields(yamlData);
          const currentIndex = fields.findIndex(f => f.path === selectedField?.path);
          if (currentIndex > 0) {
            setSelectedField(fields[currentIndex - 1]);
            setSelectedOptionIndex(0);
          }
        }
      } else if (e.key === 'ArrowDown' && !isShift) {
        e.preventDefault();
        if (currentMode === 'field') {
          const fields = getYamlFields(yamlData);
          const currentIndex = fields.findIndex(f => f.path === selectedField?.path);
          if (currentIndex < fields.length - 1) {
            setSelectedField(fields[currentIndex + 1]);
            setSelectedOptionIndex(0);
          } else if (fields.length > 0 && currentIndex === -1) {
            setSelectedField(fields[0]);
            setSelectedOptionIndex(0);
          }
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (isShift) {
          // シフト+右: 選択肢モードに移動
          if (currentMode === 'field' || currentMode === 'text') {
            setCurrentMode('select');
            setInputMode('select');
            // 現在の値に一致する選択肢があればそのインデックスを設定
            const options = getOptions(selectedField?.path);
            const currentValue = String(selectedField?.value || '');
            const matchingIndex = options.findIndex(opt => opt === currentValue);
            setSelectedOptionIndex(matchingIndex >= 0 ? matchingIndex : 0);
          } else if (currentMode === 'select') {
            // 選択肢モード内で選択肢を移動
            const options = getOptions(selectedField?.path);
            if (selectedOptionIndex < options.length - 1) {
              setSelectedOptionIndex(selectedOptionIndex + 1);
            }
          }
        } else {
          // 右キー: 選択肢モードに移動（シフトなし）
          if (currentMode === 'field') {
            setCurrentMode('select');
            setInputMode('select');
            // 現在の値に一致する選択肢があればそのインデックスを設定
            const options = getOptions(selectedField?.path);
            const currentValue = String(selectedField?.value || '');
            const matchingIndex = options.findIndex(opt => opt === currentValue);
            setSelectedOptionIndex(matchingIndex >= 0 ? matchingIndex : 0);
          } else if (currentMode === 'select') {
            // 選択肢モード内で選択肢を移動
            const options = getOptions(selectedField?.path);
            if (selectedOptionIndex < options.length - 1) {
              setSelectedOptionIndex(selectedOptionIndex + 1);
            }
          }
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (isShift) {
          // シフト+左: 選択肢モード → フィールドモード（1回目） → 自由記述モード（2回目）
          if (currentMode === 'select') {
            setCurrentMode('field');
          } else if (currentMode === 'field') {
            setCurrentMode('text');
            setInputMode('text');
          } else if (currentMode === 'text') {
            // 自由記述モードからはフィールドモードに戻る
            setCurrentMode('field');
          }
        } else {
          // 左キー: 選択肢モード内で選択肢を移動
          if (currentMode === 'select') {
            if (selectedOptionIndex > 0) {
              setSelectedOptionIndex(selectedOptionIndex - 1);
            }
          } else if (currentMode === 'field') {
            setCurrentMode('text');
            setInputMode('text');
          }
        }
      } else if (e.key === 'Enter' && currentMode === 'select') {
        e.preventDefault();
        // 選択肢を確定
        const options = getOptions(selectedField?.path);
        if (options[selectedOptionIndex] && selectedField) {
          // 直接更新処理を実行
          const newYaml = { ...yamlData };
          const keys = selectedField.path.split('.');
          let current = newYaml;
          for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) {
              current[keys[i]] = {};
            }
            current = current[keys[i]];
          }
          current[keys[keys.length - 1]] = options[selectedOptionIndex];
          setYamlData(newYaml);
          if (currentTemplate) {
            setCurrentTemplate({ ...currentTemplate, yaml: newYaml });
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [yamlData, selectedField, currentMode, selectedOptionIndex, currentTemplate]);

  // プロンプトをYAMLに変換（OpenAI API使用）
  const parsePromptToYaml = async (prompt) => {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI APIキーが設定されていません。.env に VITE_OPENAI_API_KEY=... を設定してください。');
    }

    // より強力なモデルを使用（環境変数で切り替え可能）
    const model = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini';

    const systemPrompt = `あなたは画像生成プロンプトを詳細に構造化されたJSONに変換する専門家です。
入力されたプロンプトを徹底的に分析し、プロンプト内のすべての情報を柔軟に構造化してJSON形式で返してください。

**柔軟な構造化の原則:**

1. **プロンプトの内容に応じて、必要なセクションを動的に作成してください**
   - プロンプトに含まれる情報の種類に応じて、適切なセクション名と構造を決定してください
   - 固定のセクションに限定せず、プロンプトの内容に基づいて新しいセクションを作成することも可能です

2. **一般的なセクション（参考例）:**
   - **subject** (被写体): description, gender, age など
   - **style** (スタイル): description, type, technique, aesthetic など
   - **attire_policy** (服装ポリシー): allowed, forbidden など
   - **hair_tone_lock** (髪色ロック): base_color, mid_glaze, depth_hint, highlight_max, rule など
   - **pose_and_framing** (ポーズとフレーミング): shot, angle, posture, hands, contrast など
   - **palette** (パレット): skin, hair, clothing_washes, saturation, negative_space など
   - **lighting_mood** (照明とムード): type, rim_light, atmosphere など
   - **background** (背景): type, color, description, strokes, layout など
   - **styling_keywords** (スタイリングキーワード): キーワードのリスト
   - **quality_flags** (品質フラグ): 品質フラグのリスト
   - **format** (フォーマット): aspectRatio, style, quality, stylize など
   - **optional_midjourney** (Midjourney固有): prompt_suffix, params など
   - **optional_negative_tokens** (ネガティブトークン): ネガティブトークンのリスト

3. **セクション名の認識:**
   - プロンプト内の見出しやセクション名（例: "ATTIRE POLICY", "HAIR TONE LOCK", "Pose & framing", "Palette guide" など）を認識してください
   - セクション名を適切なJSONキー名（スネークケース推奨）に変換してください
   - 例: "ATTIRE POLICY" → "attire_policy", "Hair Tone Lock" → "hair_tone_lock"

4. **データ型の適切な処理:**
   - HEXコード（例: #1F242A）や色の範囲（例: #1F242A-#2B2F36）を正確に抽出してください
   - リスト形式の情報（例: "no kimono, no yukata, no hakama"）は配列として抽出してください
   - 技術的パラメータ（--ar, --style, --quality, --stylize）をformatセクションに配置してください
   - ネストされた情報は適切に階層化してください

5. **柔軟性の確保:**
   - プロンプトに新しい種類の情報が含まれている場合、適切なセクション名と構造を作成してください
   - セクション名は、プロンプトの内容を反映した意味のある名前にしてください
   - プロンプトに含まれていない情報は、そのキーを省略してください（空文字列ではなく）

**重要な指示:**
- プロンプトに含まれるすべての詳細情報を可能な限り抽出してください
- プロンプトの構造やセクション名を尊重し、それに基づいて構造化してください
- 固定のセクションリストに縛られず、プロンプトの内容に応じて柔軟に対応してください
- JSON形式のみを返し、説明文やコメントは含めないでください
- 可能な限り詳細に構造化してください`;

    // Few-shot learningの例（期待される出力形式を示す）
    const exampleOutput = {
      "subject": {
        "description": "adult Japanese woman holding a bouquet of flowers gently in her arms",
        "gender": "女性"
      },
      "style": {
        "description": "Delicate Japanese watercolor illustration on textured washi paper. Hand-drawn pencil line (very thin, slightly uneven), airy grain. Face and hands highly refined; clothing and background simplified as soft abstract washes. Low-mid saturation, high-key whites, generous negative space.",
        "type": "watercolor",
        "technique": ["wet-on-wet", "glazing", "feathered_edges", "controlled_bloom_backrun", "visible_paper_tooth", "subtle_pigment_granulation", "dry_brush_accents", "lost_and_found_contours"],
        "aesthetic": "Japanese watercolor illustration, washi paper texture, pencil line, matte, selective color, airy, serene, semi-realistic, pixiv-trending, detail-contrast, abstract washes, modern clothing"
      },
      "attire_policy": {
        "allowed": ["contemporary everyday wear", "tank top", "T-shirt", "blouse", "knit", "light sportswear", "simple dress"],
        "forbidden": ["kimono", "yukata", "hakama", "furisode", "obi sash", "kimono collars", "wide kimono sleeves", "traditional patterns", "seigaiha", "asanoha"]
      },
      "hair_tone_lock": {
        "base_color": ["#1F242A", "#2B2F36"],
        "mid_glaze": ["#343A42", "#404650"],
        "depth_hint": "sepia/indigo mix",
        "highlight_max": "#B8C1C8",
        "rule": [
          "No gray, white, or blonde hair",
          "At least 90% of the hair area must be tinted (avoid leaving paper white)",
          "Lashes/eyebrows match hair tone",
          "Include a few natural flyaway strands"
        ]
      },
      "pose_and_framing": {
        "shot": "waist/bust-up",
        "angle": "gentle 3/4 or side profile",
        "posture": "elegant, natural Japanese proportions",
        "hands": "Japanese hands, slender and correct anatomy",
        "contrast": "facial features smooth and precise; clothing & background kept painterly"
      },
      "palette": {
        "skin": {
          "base": "paper white",
          "accents": "#EFCAD3"
        },
        "hair": {
          "tones": ["deep black-brown (cool bias)", "#1F242A-#404650 range"]
        },
        "clothing_washes": ["#6E7A87", "#B8C1C8", "#F2DCE6", "#C9D7D2"],
        "saturation": "restrained",
        "negative_space": "preserve clean white paper areas"
      },
      "lighting_mood": {
        "type": "soft ambient window light",
        "rim_light": "gentle on cheek/nose",
        "atmosphere": "serene, intimate, contemporary"
      },
      "background": {
        "type": "plain white or very pale wash",
        "strokes": "2-3 broad abstract strokes only (vertical or circular)",
        "layout": "one side kept brightest for airy text space"
      },
      "styling_keywords": [
        "Japanese watercolor illustration",
        "washi paper texture",
        "pencil line",
        "matte",
        "selective color",
        "airy",
        "serene",
        "semi-realistic",
        "pixiv-trending",
        "detail-contrast",
        "abstract washes",
        "modern clothing"
      ],
      "quality_flags": [
        "masterpiece",
        "best quality",
        "high detail",
        "clean composition"
      ],
      "format": {
        "aspectRatio": "3:4",
        "style": "raw",
        "quality": 1,
        "stylize": 50
      },
      "optional_midjourney": {
        "prompt_suffix": "(hair: deep cool black-brown)++ (no white hair)++ (no gray hair)++ (no kimono)++ (no yukata)++ (no hakama)++ (no obi)++ (modern clothing)++",
        "params": {
          "ar": "3:4",
          "style": "raw",
          "quality": 1,
          "stylize": 50
        }
      },
      "optional_negative_tokens": [
        "white hair",
        "silver hair",
        "gray hair",
        "platinum hair",
        "overexposed hair",
        "blown highlights",
        "kimono",
        "yukata",
        "hakama",
        "furisode",
        "obi",
        "kimono collar",
        "wide kimono sleeves",
        "traditional Japanese clothing",
        "traditional patterns",
        "seigaiha",
        "asanoha"
      ]
    };

    const userPrompt = `以下のプロンプトを詳細に構造化されたJSONに変換してください。プロンプト内のすべての情報を可能な限り抽出し、適切なセクションに配置してください。プロンプトの内容に応じて、必要なセクションを柔軟に作成してください。上記の例を参考に、同様の詳細さで構造化してください:\n\n${prompt}`;

    // デバッグ用: プロンプトをコンソールに出力（開発環境での確認用）
    if (import.meta.env.DEV) {
      console.log('📝 解析対象プロンプト:', prompt);
      console.log('🤖 使用モデル:', model);
    }

    try {
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
            { role: 'user', content: `例として、以下のような詳細な構造化を期待しています:\n${JSON.stringify(exampleOutput, null, 2)}` },
            { role: 'assistant', content: JSON.stringify(exampleOutput) },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2, // 構造化タスクのため、より低い温度で一貫性を向上
          response_format: { type: 'json_object' }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API呼び出しに失敗しました (${response.status})`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error('APIからの応答が空です');
      }

      // JSONをパース
      const yaml = JSON.parse(content);
      
      // デバッグ用: 解析結果をコンソールに出力（開発環境での確認用）
      if (import.meta.env.DEV) {
        console.log('✅ 解析結果:', JSON.stringify(yaml, null, 2));
        console.log('📊 抽出されたセクション:', Object.keys(yaml));
      }
      
      // 空のオブジェクトを削除
      const cleanYaml = {};
      for (const [key, value] of Object.entries(yaml)) {
        if (value && typeof value === 'object' && Object.keys(value).length > 0) {
          cleanYaml[key] = value;
        }
      }

      return cleanYaml;
    } catch (err) {
      console.error('OpenAI API エラー:', err);
      throw err;
    }
  };

  // テンプレート生成
  const handleGenerateTemplate = async () => {
    if (!masterPrompt.trim()) {
      alert('マスタープロンプトを入力してください');
      return;
    }

    setIsParsing(true);
    setParseError(null);

    try {
      const yaml = await parsePromptToYaml(masterPrompt);
      setYamlData(yaml);
      setCurrentTemplate({ name: '', yaml, originalPrompt: masterPrompt });
      const fields = getYamlFields(yaml);
      if (fields.length > 0) {
        setSelectedField(fields[0]);
        setCurrentMode('field');
        setSelectedOptionIndex(0);
      }
    } catch (err) {
      setParseError(err.message || 'プロンプトの解析に失敗しました');
      console.error('テンプレート生成エラー:', err);
    } finally {
      setIsParsing(false);
    }
  };

  // YAML値を更新
  const updateYamlValue = (path, value) => {
    const newYaml = { ...yamlData };
    const keys = path.split('.');
    let current = newYaml;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    setYamlData(newYaml);
    if (currentTemplate) {
      setCurrentTemplate({ ...currentTemplate, yaml: newYaml });
    }
  };

  // YAMLからプロンプトを生成（再帰的にすべての情報を抽出）
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
        // 配列の場合は、各要素を処理
        obj.forEach((item, index) => {
          if (typeof item === 'string' && item.trim()) {
            parts.push(item.trim());
          } else if (typeof item === 'object' && item !== null) {
            traverse(item, prefix);
          }
        });
        return;
      }

      if (typeof obj !== 'object') {
        // プリミティブ値の場合
        if (typeof obj === 'string' && obj.trim()) {
          parts.push(obj.trim());
        } else if (typeof obj === 'number' || typeof obj === 'boolean') {
          parts.push(String(obj));
        }
        return;
      }

      // オブジェクトの場合、各キーを処理
      for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined || value === '') {
          continue;
        }

        // 特別な処理が必要なセクション
        if (key === 'format') {
          // formatセクションは技術的パラメータとして処理
          if (value.aspectRatio) {
            parts.push(`--ar ${value.aspectRatio}`);
          }
          if (value.style) {
            parts.push(`--style ${value.style}`);
          }
          if (value.quality) {
            parts.push(`--quality ${value.quality}`);
          }
          if (value.stylize) {
            parts.push(`--stylize ${value.stylize}`);
          }
          // その他のformatプロパティも処理
          for (const [formatKey, formatValue] of Object.entries(value)) {
            if (!['aspectRatio', 'style', 'quality', 'stylize'].includes(formatKey)) {
              if (typeof formatValue === 'string' && formatValue.trim()) {
                parts.push(`--${formatKey} ${formatValue.trim()}`);
              }
            }
          }
        } else if (key === 'optional_midjourney') {
          // Midjourneyのオプション
          if (value.prompt_suffix) {
            parts.push(value.prompt_suffix);
          }
          if (value.params) {
            for (const [paramKey, paramValue] of Object.entries(value.params)) {
              if (paramValue !== null && paramValue !== undefined && paramValue !== '') {
                parts.push(`--${paramKey} ${paramValue}`);
              }
            }
          }
        } else if (key === 'optional_negative_tokens') {
          // ネガティブトークン
          if (Array.isArray(value)) {
            const negativeTokens = value.filter(t => t && typeof t === 'string' && t.trim());
            if (negativeTokens.length > 0) {
              parts.push(`negative: ${negativeTokens.join(', ')}`);
            }
          }
        } else if (key === 'styling_keywords') {
          // スタイリングキーワード
          if (Array.isArray(value)) {
            const keywords = value.filter(k => k && typeof k === 'string' && k.trim());
            if (keywords.length > 0) {
              parts.push(keywords.join(', '));
            }
          }
        } else if (key === 'quality_flags') {
          // クオリティフラグ
          if (Array.isArray(value)) {
            const flags = value.filter(f => f && typeof f === 'string' && f.trim());
            if (flags.length > 0) {
              parts.push(flags.join(', '));
            }
          }
        } else if (key === 'attire_policy') {
          // 服装ポリシー
          if (value.allowed && Array.isArray(value.allowed)) {
            const allowed = value.allowed.filter(a => a && typeof a === 'string' && a.trim());
            if (allowed.length > 0) {
              parts.push(`allowed attire: ${allowed.join(', ')}`);
            }
          }
          if (value.forbidden && Array.isArray(value.forbidden)) {
            const forbidden = value.forbidden.filter(f => f && typeof f === 'string' && f.trim());
            if (forbidden.length > 0) {
              parts.push(`forbidden: ${forbidden.join(', ')}`);
            }
          }
        } else if (key === 'hair_tone_lock') {
          // 髪の色ロック
          if (value.base_color && Array.isArray(value.base_color)) {
            parts.push(`hair base color: ${value.base_color.join('-')}`);
          }
          if (value.mid_glaze && Array.isArray(value.mid_glaze)) {
            parts.push(`hair mid glaze: ${value.mid_glaze.join('-')}`);
          }
          if (value.highlight_max) {
            parts.push(`hair highlight max: ${value.highlight_max}`);
          }
          if (value.rule && Array.isArray(value.rule)) {
            value.rule.forEach(rule => {
              if (typeof rule === 'string' && rule.trim()) {
                parts.push(rule.trim());
              }
            });
          }
        } else if (key === 'palette') {
          // パレット
          if (value.skin) {
            if (value.skin.base) parts.push(`skin base: ${value.skin.base}`);
            if (value.skin.accents) parts.push(`skin accents: ${value.skin.accents}`);
          }
          if (value.hair) {
            if (value.hair.tones) {
              if (Array.isArray(value.hair.tones)) {
                parts.push(`hair tones: ${value.hair.tones.join(', ')}`);
              } else if (typeof value.hair.tones === 'string') {
                parts.push(`hair tones: ${value.hair.tones}`);
              }
            }
          }
          if (value.clothing_washes && Array.isArray(value.clothing_washes)) {
            parts.push(`clothing washes: ${value.clothing_washes.join(', ')}`);
          }
          if (value.saturation) parts.push(`saturation: ${value.saturation}`);
          if (value.negative_space) parts.push(`negative space: ${value.negative_space}`);
        } else if (key === 'pose_and_framing') {
          // ポーズとフレーミング
          const poseParts = [];
          if (value.shot) poseParts.push(`shot: ${value.shot}`);
          if (value.angle) poseParts.push(`angle: ${value.angle}`);
          if (value.posture) poseParts.push(`posture: ${value.posture}`);
          if (value.hands) poseParts.push(`hands: ${value.hands}`);
          if (value.contrast) poseParts.push(`contrast: ${value.contrast}`);
          if (poseParts.length > 0) {
            parts.push(poseParts.join(', '));
          }
        } else if (key === 'lighting_mood') {
          // ライティングとムード
          const lightingParts = [];
          if (value.type) lightingParts.push(`lighting: ${value.type}`);
          if (value.rim_light) lightingParts.push(`rim light: ${value.rim_light}`);
          if (value.atmosphere) lightingParts.push(`atmosphere: ${value.atmosphere}`);
          if (lightingParts.length > 0) {
            parts.push(lightingParts.join(', '));
          }
        } else if (key === 'background') {
          // 背景
          if (value.type) parts.push(`background type: ${value.type}`);
          if (value.color) parts.push(`background color: ${value.color}`);
          if (value.description) parts.push(`background: ${value.description}`);
          if (value.strokes) parts.push(`background strokes: ${value.strokes}`);
          if (value.layout) parts.push(`background layout: ${value.layout}`);
        } else if (key === 'style') {
          // スタイル
          if (value.description) {
            parts.push(value.description);
          }
          if (value.type) {
            parts.push(`style type: ${value.type}`);
          }
          if (value.aesthetic) {
            parts.push(`aesthetic: ${value.aesthetic}`);
          }
          if (value.technique && Array.isArray(value.technique)) {
            parts.push(`technique: ${value.technique.join(', ')}`);
          }
        } else if (key === 'subject') {
          // 被写体
          if (value.description) {
            parts.push(value.description);
          }
          if (value.age) parts.push(`age: ${value.age}`);
          if (value.gender) parts.push(`gender: ${value.gender}`);
        } else if (key === 'mood') {
          // ムード
          if (value.description) {
            parts.push(`mood: ${value.description}`);
          }
        } else if (key === 'typography') {
          // タイポグラフィ
          if (value.text) parts.push(`text: ${value.text}`);
          if (value.font_style) parts.push(`font style: ${value.font_style}`);
        } else {
          // その他のキーは再帰的に処理
          if (typeof value === 'string' && value.trim()) {
            parts.push(`${key}: ${value.trim()}`);
          } else if (typeof value === 'object') {
            traverse(value, prefix ? `${prefix}.${key}` : key);
          }
        }
      }
    };

    traverse(yaml);
    
    // 重複を除去し、空の要素をフィルタリング
    const uniqueParts = [...new Set(parts.filter(p => p && p.trim()))];
    
    return uniqueParts.join(', ');
  };

  // テンプレートを保存
  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      alert('テンプレート名を入力してください');
      return;
    }

    const newTemplate = {
      // UUID型のIDを生成（テーブルのidカラムがUUID型のため）
      id: generateUUID(),
      name: templateName,
      yaml: yamlData,
      originalPrompt: masterPrompt,
      fieldOptions: fieldOptions, // 選択肢も一緒に保存
      createdAt: new Date().toISOString(),
    };

    setTemplates(prev => [...prev, newTemplate]);
    persistTemplate(newTemplate);
    setTemplateName('');
    alert('テンプレートを保存しました');
  };

  // F-05: スタイルライブラリに追加
  const handleAddToStyleLibrary = () => {
    if (!yamlData) {
      alert('YAMLデータがありません');
      return;
    }

    const styleName = window.prompt('スタイル名を入力してください:', templateName || 'プロンプト ' + new Date().toLocaleString('ja-JP'));
    if (!styleName || !styleName.trim()) {
      return;
    }

    // YAMLデータをそのまま保存（JSON文字列としてpromptフィールドに保存）
    const newStyle = {
      id: generateUUID(),
      name: styleName.trim(),
      prompt: JSON.stringify(yamlData), // YAMLデータをJSON文字列として保存
      yaml: yamlData, // ローカル状態用にYAMLオブジェクトも保持
      thumbnail: null,
      source: 'prompt-mode',
      createdAt: new Date().toISOString()
    };

    onStyleCreated(newStyle);
    alert('スタイルライブラリに追加しました！');
  };

  // テンプレートを読み込み
  const handleLoadTemplate = (template) => {
    setCurrentTemplate(template);
    setYamlData(template.yaml);
    setMasterPrompt(template.originalPrompt);
    // 保存された選択肢があれば読み込む
    if (template.fieldOptions) {
      setFieldOptions(template.fieldOptions);
    }
    const fields = getYamlFields(template.yaml);
    if (fields.length > 0) {
      setSelectedField(fields[0]);
      setCurrentMode('field');
      setSelectedOptionIndex(0);
    }
  };

  // YAMLをダウンロード
  const handleDownloadYaml = () => {
    const yamlContent = JSON.stringify(yamlData, null, 2);
    const blob = new Blob([yamlContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `template-${templateName || 'untitled'}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // プロンプトをダウンロード
  const handleDownloadPrompt = () => {
    const promptContent = generatePromptFromYaml(yamlData);
    const blob = new Blob([promptContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prompt-${templateName || 'untitled'}-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // YAMLをクリップボードにコピー
  const handleCopyYaml = async () => {
    const yamlContent = JSON.stringify(yamlData, null, 2);
    try {
      await navigator.clipboard.writeText(yamlContent);
      alert('YAMLをクリップボードにコピーしました');
    } catch (err) {
      console.error('コピーに失敗しました:', err);
      alert('コピーに失敗しました');
    }
  };

  // プロンプトをクリップボードにコピー
  const handleCopyPrompt = async () => {
    const promptContent = generatePromptFromYaml(yamlData);
    try {
      await navigator.clipboard.writeText(promptContent);
      alert('プロンプトをクリップボードにコピーしました');
    } catch (err) {
      console.error('コピーに失敗しました:', err);
      alert('コピーに失敗しました');
    }
  };

  // YAML編集モードを開始
  const handleStartEditYaml = () => {
    setEditingYamlText(JSON.stringify(yamlData, null, 2));
    setIsEditingYaml(true);
  };

  // YAML編集を保存
  const handleSaveEditYaml = () => {
    try {
      const parsed = JSON.parse(editingYamlText);
      setYamlData(parsed);
      if (currentTemplate) {
        setCurrentTemplate({ ...currentTemplate, yaml: parsed });
      }
      setIsEditingYaml(false);
      // フィールドリストを更新
      const fields = getYamlFields(parsed);
      if (fields.length > 0) {
        // 現在選択中のフィールドが存在するか確認
        const currentFieldExists = fields.some(f => f.path === selectedField?.path);
        if (!currentFieldExists && fields.length > 0) {
          setSelectedField(fields[0]);
        }
      } else {
        setSelectedField(null);
      }
      alert('YAMLを更新しました');
    } catch (err) {
      alert('YAMLの形式が正しくありません。JSON形式で入力してください。');
      console.error('YAML解析エラー:', err);
    }
  };

  // YAML編集をキャンセル
  const handleCancelEditYaml = () => {
    setIsEditingYaml(false);
    setEditingYamlText('');
  };

  return (
    <div className="prompt-maker">
      <div className="prompt-maker-layout">
        {/* 左: ライブラリ */}
        <div className="template-library-sidebar">
          <h2>📚 テンプレートライブラリ</h2>
          <div className="template-list">
            {templates.length === 0 ? (
              <p className="empty-templates">テンプレートがありません</p>
            ) : (
              templates.map(template => (
                <div
                  key={template.id}
                  className={`template-item ${currentTemplate?.id === template.id ? 'active' : ''}`}
                  onClick={() => handleLoadTemplate(template)}
                  style={{ position: 'relative', paddingRight: '30px' }}
                >
                  <h3>{template.name}</h3>
                  <p className="template-date">{new Date(template.createdAt).toLocaleDateString('ja-JP')}</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTemplate(template.id);
                    }}
                    className="delete-image-button"
                    title="削除"
                    style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 10 }}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
          {templateError && (
            <div className="error-message" style={{ marginTop: '8px' }}>
              {templateError}
            </div>
          )}
        </div>

        {/* 中央: メインエリア */}
        <div className="prompt-maker-main">
          {!yamlData ? (
            /* YAMLメーカー画面 */
            <div className="yaml-maker-container">
              <h1>📝 プロンプトYAMLメーカー</h1>
              <p className="subtitle">マスタープロンプトを入力して、構造化テンプレートを生成します</p>
              
              <div className="master-prompt-section">
                <label htmlFor="master-prompt">マスタープロンプト</label>
                <textarea
                  id="master-prompt"
                  value={masterPrompt}
                  onChange={(e) => setMasterPrompt(e.target.value)}
                  placeholder="例: A beautiful sunset over the ocean, color: vibrant orange and pink, style: photorealistic, mood: peaceful, --ar 16:9"
                  rows={8}
                  className="master-prompt-input"
                  disabled={isParsing}
                />
                <button 
                  onClick={handleGenerateTemplate} 
                  className="generate-template-button"
                  disabled={isParsing || !masterPrompt.trim()}
                >
                  {isParsing ? '解析中...' : 'テンプレート生成'}
                </button>
                {isParsing && (
                  <div className="parsing-indicator">
                    <div className="spinner"></div>
                    <p>OpenAI APIでプロンプトを解析しています...</p>
                  </div>
                )}
                {parseError && (
                  <div className="parse-error-message">
                    <p>⚠️ {parseError}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* テンプレート設定画面 */
            <div className="template-editor-container">
              <div className="template-editor-header">
                <h1>⚙️ テンプレート設定</h1>
                <div className="template-actions">
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="テンプレート名"
                    className="template-name-input"
                  />
                  <button onClick={handleSaveTemplate} className="save-template-button">
                    保存
                  </button>
                  <button onClick={() => {
                    setYamlData(null);
                    setCurrentTemplate(null);
                    setMasterPrompt('');
                  }} className="new-template-button">
                    新規作成
                  </button>
                </div>
              </div>

              <div className="template-editor-layout">
                {/* 左: 設定項目リスト */}
                <div className="template-fields-list">
                  <h3>設定項目</h3>
                  <p className="keyboard-hint">
                    ↑↓ で項目選択、Shift+→ で選択肢、Shift+← で設定項目/自由入力
                  </p>
                  <div className="fields-list">
                    {getYamlFields(yamlData).map((field) => (
                      <div
                        key={field.path}
                        className={`field-item ${selectedField?.path === field.path ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedField(field);
                          setCurrentMode('field');
                          setSelectedOptionIndex(0);
                        }}
                      >
                        <div className="field-path">{field.path}</div>
                        <div className="field-value">{String(field.value || '')}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 中央: 編集エリア */}
                <div className="template-editor-area">
                  {selectedField && (
                    <div className="field-editor">
                      <h3>編集: {selectedField.path}</h3>
                      {inputMode === 'select' ? (
                        <div className="select-mode">
                          <p>選択肢モード（→で選択肢移動、Shift+←で設定項目に戻る）</p>
                          <div className="option-actions" style={{ marginBottom: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => generateOptionsWithAI(selectedField.path)}
                              className="generate-options-button"
                              disabled={isGeneratingOptions}
                              style={{ padding: '8px 16px', fontSize: '14px' }}
                            >
                              {isGeneratingOptions ? '🤖 AI生成中...' : '🤖 AIで選択肢を生成'}
                            </button>
                            <button
                              onClick={() => handleEditOptions(selectedField.path)}
                              className="edit-options-button"
                              style={{ padding: '8px 16px', fontSize: '14px' }}
                            >
                              ✏️ 選択肢を手動編集
                            </button>
                          </div>
                          {isEditingOptions === selectedField.path ? (
                            <div className="options-editor" style={{ marginBottom: '12px' }}>
                              <label>選択肢を1行に1つずつ入力:</label>
                              <textarea
                                value={editingOptionsText}
                                onChange={(e) => setEditingOptionsText(e.target.value)}
                                rows={8}
                                style={{ width: '100%', padding: '8px', marginTop: '4px', fontFamily: 'monospace', fontSize: '12px' }}
                                placeholder="選択肢1&#10;選択肢2&#10;選択肢3&#10;..."
                              />
                              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                <button
                                  onClick={() => handleSaveOptions(selectedField.path)}
                                  className="save-options-button"
                                  style={{ padding: '8px 16px' }}
                                >
                                  保存
                                </button>
                                <button
                                  onClick={handleCancelEditOptions}
                                  className="cancel-options-button"
                                  style={{ padding: '8px 16px' }}
                                >
                                  キャンセル
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="option-buttons">
                              {getOptions(selectedField.path).map((option, index) => (
                                <button
                                  key={index}
                                  onClick={() => {
                                    updateYamlValue(selectedField.path, option);
                                    setSelectedOptionIndex(index);
                                  }}
                                  className={selectedOptionIndex === index ? 'selected' : ''}
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                          )}
                          <p className="option-hint">Enterキーで選択を確定</p>
                        </div>
                      ) : (
                        <div className="text-mode">
                          <p>自由入力モード（Shift+←で設定項目に戻る）</p>
                          <input
                            type="text"
                            value={String(selectedField.value || '')}
                            onChange={(e) => updateYamlValue(selectedField.path, e.target.value)}
                            className="field-text-input"
                            autoFocus={currentMode === 'text'}
                          />
                        </div>
                      )}
                      <div className={`mode-indicator mode-indicator-${currentMode}`}>
                        現在のモード: {currentMode === 'field' ? '設定項目' : currentMode === 'select' ? '選択肢' : '自由入力'}
                      </div>
                    </div>
                  )}
                </div>

                {/* 右: プレビュー */}
                <div className="template-preview">
                  <h3>プレビュー</h3>
                  <div className="yaml-preview">
                    <div className="preview-header">
                      <h4>YAML</h4>
                      <div className="preview-actions">
                        {!isEditingYaml ? (
                          <>
                            <button onClick={handleCopyYaml} className="copy-button" title="YAMLをコピー">
                              📋 コピー
                            </button>
                            <button onClick={handleDownloadYaml} className="download-button" title="YAMLをダウンロード">
                              💾 ダウンロード
                            </button>
                            <button onClick={handleStartEditYaml} className="edit-button" title="YAMLを編集">
                              ✏️ 編集
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={handleSaveEditYaml} className="save-button" title="保存">
                              💾 保存
                            </button>
                            <button onClick={handleCancelEditYaml} className="cancel-button" title="キャンセル">
                              ✖️ キャンセル
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {isEditingYaml ? (
                      <textarea
                        value={editingYamlText}
                        onChange={(e) => setEditingYamlText(e.target.value)}
                        className="yaml-edit-textarea"
                        rows={20}
                        style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px' }}
                      />
                    ) : (
                      <pre>{JSON.stringify(yamlData, null, 2)}</pre>
                    )}
                  </div>
                  <div className="prompt-preview">
                    <div className="preview-header">
                      <h4>生成されたプロンプト</h4>
                      <div className="preview-actions">
                        <button onClick={handleCopyPrompt} className="copy-button" title="プロンプトをコピー">
                          📋 コピー
                        </button>
                        <button onClick={handleDownloadPrompt} className="download-button" title="プロンプトをダウンロード">
                          💾 ダウンロード
                        </button>
                        {/* F-05: スタイルライブラリに追加 */}
                        <button 
                          onClick={handleAddToStyleLibrary} 
                          className="add-to-style-button" 
                          title="スタイルライブラリに追加"
                          style={{ marginLeft: '8px' }}
                        >
                          📚 スタイルに追加
                        </button>
                      </div>
                    </div>
                    <p className="generated-prompt">{generatePromptFromYaml(yamlData)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageGenerator;
