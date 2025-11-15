import React, { useState, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { useAuth } from './contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './ImageGenerator.css';
import { supabaseRest } from './lib/supabaseClient';

const createDefaultStyles = () => ([
  { id: '1', name: '和風アート', prompt: '日本の伝統的な和風アートスタイル、浮世絵風、美しい色彩', thumbnail: null, source: 'manual', createdAt: new Date().toISOString() },
  { id: '2', name: '未来都市', prompt: '未来の都市、サイバーパンク、ネオンライト、高層ビル', thumbnail: null, source: 'manual', createdAt: new Date().toISOString() },
  { id: '3', name: 'ファンタジー', prompt: 'ファンタジー世界、魔法、幻想的な風景、エピックな構図', thumbnail: null, source: 'manual', createdAt: new Date().toISOString() },
  { id: '4', name: '水彩画', prompt: '水彩画スタイル、柔らかい色合い、繊細な筆使い', thumbnail: null, source: 'manual', createdAt: new Date().toISOString() },
]);

const ImageGenerator = () => {
  const { user, session, logout } = useAuth();
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
  const [objectInputs, setObjectInputs] = useState({ person: '', background: '', other: '' }); // オブジェクト入力
  const [yamlInput, setYamlInput] = useState(''); // YAML形式の入力

  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  const supabaseToken = session?.access_token;

  const syncImageRecord = useCallback(async (image) => {
    if (!user?.id) return;
    try {
      await supabaseRest('/rest/v1/image_histories', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: {
          id: image.id,
          user_id: user.id,
          prompt: image.prompt,
          thumbnail_url: image.thumbnailUrl || image.imageUrl || null,
          created_at: image.createdAt,
          revision: image.revision || 0,
          title: image.title || '',
          saved: image.saved || false,
        },
        accessToken: supabaseToken,
      });
    } catch (err) {
      console.error('画像履歴の保存に失敗しました', err);
    }
  }, [user?.id, supabaseToken]);

  const deleteImageRecord = useCallback(async (imageId) => {
    if (!user?.id) return;
    try {
      await supabaseRest(`/rest/v1/image_histories?id=eq.${encodeURIComponent(imageId)}&user_id=eq.${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
        accessToken: supabaseToken,
      });
    } catch (err) {
      console.error('画像履歴の削除に失敗しました', err);
    }
  }, [user?.id, supabaseToken]);

  const syncStyleRecord = useCallback(async (style) => {
    if (!user?.id) return;
    try {
      await supabaseRest('/rest/v1/image_styles', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: {
          id: style.id,
          user_id: user.id,
          name: style.name,
          prompt: style.prompt,
          thumbnail: style.thumbnail || null,
          source: style.source || 'manual',
          created_at: style.createdAt || new Date().toISOString(),
        },
        accessToken: supabaseToken,
      });
    } catch (err) {
      console.error('スタイルの保存に失敗しました', err);
    }
  }, [user?.id, supabaseToken]);

  const deleteStyleRecord = useCallback(async (styleId) => {
    if (!user?.id) return;
    try {
      await supabaseRest(`/rest/v1/image_styles?id=eq.${encodeURIComponent(styleId)}&user_id=eq.${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
        accessToken: supabaseToken,
      });
    } catch (err) {
      console.error('スタイルの削除に失敗しました', err);
    }
  }, [user?.id, supabaseToken]);

  useEffect(() => {
    if (!user?.id || !supabaseToken) {
      setImages([]);
      setStyles(createDefaultStyles());
      return;
    }

    let active = true;

    const loadData = async () => {
      try {
        const [historyRows, styleRows] = await Promise.all([
          supabaseRest(`/rest/v1/image_histories?user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.desc&limit=10`, {
            accessToken: supabaseToken,
          }),
          supabaseRest(`/rest/v1/image_styles?user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.desc`, {
            accessToken: supabaseToken,
          }),
        ]);

        if (!active) return;

        setImages(Array.isArray(historyRows)
          ? historyRows.map(row => ({
              id: row.id,
              prompt: row.prompt,
              thumbnailUrl: row.thumbnail_url,
              createdAt: row.created_at,
              revision: row.revision || 0,
              title: row.title || '',
              saved: row.saved || false,
            }))
          : []);

        if (Array.isArray(styleRows) && styleRows.length > 0) {
          setStyles(styleRows.map(row => ({
            id: row.id,
            name: row.name,
            prompt: row.prompt,
            thumbnail: row.thumbnail || null,
            source: row.source || 'manual',
            createdAt: row.created_at,
          })));
        } else {
          setStyles(createDefaultStyles());
        }
      } catch (err) {
        console.error('Supabaseからデータの取得に失敗しました', err);
        if (active) {
          setError('データの読み込みに失敗しました。再度お試しください。');
        }
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, [user?.id, supabaseToken]);

  // 画像をBase64に変換
  const imageToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]; // data:image/...;base64, の部分を除去
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

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
            console.error('画像データの抽出に失敗しました:', err);
            setError('画像データの処理に失敗しました');
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
      const imageId = regenerateId || Date.now().toString();
      const revision = regenerateId && Array.isArray(images)
        ? ((images.find(img => img && img.id === regenerateId)?.revision || 0) + 1)
        : 0;

      // サムネイルを生成
      let thumbnailUrl = imageDataUrl; // フォールバック用
      try {
        thumbnailUrl = await generateThumbnail(imageDataUrl, 200);
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
        await syncImageRecord(newImage);
      } catch (stateErr) {
        console.error('状態更新エラー:', stateErr);
        throw new Error(`画像の保存に失敗しました: ${stateErr.message}`);
      }
    } catch (err) {
      const errorMessage = err.message || 'エラーが発生しました';
      console.error('画像生成エラー詳細:', {
        message: errorMessage,
        error: err,
        stack: err.stack
      });
      setError(errorMessage);
      // エラーが発生してもローディング状態を解除
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
      setError('画像の読み込みに失敗しました');
      console.error(err);
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
      setError('ダウンロードに失敗しました');
      console.error('ダウンロードエラー:', err);
    }
  };

  // v5: スタイルをプロンプトに適用
  const handleStyleClick = (stylePrompt) => {
    if (prompt.trim()) {
      setPrompt(`${prompt}, ${stylePrompt}`);
    } else {
      setPrompt(stylePrompt);
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
    // YAML形式の入力がある場合はそれを優先
    if (yamlInput.trim()) {
      try {
        const yamlObj = JSON.parse(yamlInput);
        const parts = [];
        
        // YAMLからプロンプトを構築
        if (yamlObj.style) {
          if (typeof yamlObj.style === 'string') {
            parts.push(yamlObj.style);
          } else if (yamlObj.style.type) {
            parts.push(`style: ${yamlObj.style.type}`);
          }
        }
        if (yamlObj.person) {
          parts.push(yamlObj.person);
        }
        if (yamlObj.background) {
          parts.push(yamlObj.background);
        }
        if (yamlObj.other) {
          parts.push(yamlObj.other);
        }
        
        return parts.join(', ');
      } catch (e) {
        // YAML解析に失敗した場合は、そのままテキストとして使用
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

  // F-07: オブジェクト入力モードでの画像生成
  const handleSubmitWithObjects = (e) => {
    e.preventDefault();
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
        id: Date.now().toString(),
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
    generateThumbnail(image.fullImageUrl || image.imageUrl || image.thumbnailUrl, 200)
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

        syncStyleRecord(updatedStyle);

        alert('スタイルのサムネイルを設定しました！');
      })
      .catch(err => {
        console.error('サムネイル生成に失敗しました:', err);
        alert('サムネイルの設定に失敗しました');
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
      id: Date.now().toString(),
      name: newStyleName,
      prompt: newStylePrompt,
      thumbnail: null,
      source: 'manual',
      createdAt: new Date().toISOString()
    };

    setStyles(prev => [...prev, newStyle]);
    syncStyleRecord(newStyle);
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
      syncStyleRecord(updatedStyle);
    }
  };

  // スタイル編集をキャンセル
  const handleCancelEditStyle = () => {
    setEditingStyleId(null);
    setEditStyleName('');
    setEditStylePrompt('');
  };

  const handleStyleCreatedFromPrompt = useCallback((style) => {
    setStyles(prev => [...prev, style]);
    syncStyleRecord(style);
  }, [syncStyleRecord]);

  // 画像を削除
  const handleDeleteImage = (imageId, e) => {
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
        deleteImageRecord(imageId);
      } catch (err) {
        console.error('画像の削除に失敗しました:', err);
        setError('画像の削除に失敗しました');
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

  // F-01: ダウンロード処理（フルサイズ画像を保存）
  const handleDownloadImage = (imageId) => {
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
      console.error('ダウンロードエラー:', err);
      setError('ダウンロードに失敗しました');
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
                            setSelectedStyleId(style.id);
                            handleStyleClick(style.prompt);
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

            {/* F-07: オブジェクト入力機能（YAML形式） */}
            <div className="prompt-builder">
              <div className="yaml-input-section" style={{ marginBottom: '16px' }}>
                <label htmlFor="yaml-input">スタイル・人物・背景（YAML形式）</label>
                <textarea
                  id="yaml-input"
                  value={yamlInput}
                  onChange={(e) => setYamlInput(e.target.value)}
                  placeholder={`例:
{
  "style": "photorealistic, vibrant colors",
  "person": "若い女性、長い髪、笑顔",
  "background": "夕日の海辺、雲一つない空",
  "other": "カメラアングル: 正面、構図: 中央"
}`}
                  rows={12}
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    marginTop: '4px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    lineHeight: '1.5'
                  }}
                  disabled={loading}
                />
                <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  JSON形式で入力してください。style, person, background, other のフィールドが使用できます。
                </p>
              </div>

              <div className="prompt-preview" style={{ marginBottom: '16px' }}>
                <label htmlFor="prompt-preview">生成プロンプト</label>
                <textarea
                  id="prompt-preview"
                  value={buildFinalPrompt()}
                  readOnly
                  rows={3}
                  style={{ width: '100%', padding: '8px', marginTop: '4px', backgroundColor: '#f5f5f5' }}
                />
              </div>
            </div>

            <form onSubmit={handleSubmitWithObjects} className="prompt-form">
              <div className="form-group">
                <label htmlFor="prompt">プロンプトを直接入力（オプション）</label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="例: 美しい夕日の風景、猫が座っている様子、未来の都市..."
                  rows={4}
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                className="generate-button"
                disabled={loading || (!buildFinalPrompt().trim() && !prompt.trim())}
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
                    onError={(e) => {
                      console.error('画像の読み込みエラー:', currentImage);
                      setError('画像の表示に失敗しました');
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
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCurrentImageId(img.id);
                      }}
                      className="view-button"
                      style={{ fontSize: '11px', padding: '4px 8px', cursor: 'pointer', zIndex: 10 }}
                      title="表示"
                      type="button"
                    >
                      👁️
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
                    setCurrentImageId(quickLookImage.id);
                    setQuickLookImage(null);
                  }}
                  className="view-button"
                  style={{ padding: '8px 16px' }}
                >
                  👁️ 詳細表示
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
  const { user, session } = useAuth();
  const supabaseToken = session?.access_token;
  const [masterPrompt, setMasterPrompt] = useState('');
  const [yamlData, setYamlData] = useState(null);
  const [selectedField, setSelectedField] = useState(null);
  const [inputMode, setInputMode] = useState('select'); // 'select' | 'text'
  const [templates, setTemplates] = useState([]);
  const [currentTemplate, setCurrentTemplate] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [isParsing, setIsParsing] = useState(false); // プロンプト解析中のローディング状態
  const [parseError, setParseError] = useState(null); // 解析エラー
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0); // 選択肢モード内での選択インデックス
  const [currentMode, setCurrentMode] = useState('field'); // 'field' | 'select' | 'text' - 現在のモード
  const [isEditingYaml, setIsEditingYaml] = useState(false); // YAML編集モード
  const [editingYamlText, setEditingYamlText] = useState(''); // 編集中のYAMLテキスト
  const [fieldOptions, setFieldOptions] = useState({}); // フィールドごとの選択肢 { fieldPath: [options] }
  const [isGeneratingOptions, setIsGeneratingOptions] = useState(false); // AI選択肢生成中
  const [isEditingOptions, setIsEditingOptions] = useState(false); // 選択肢編集モード
  const [editingOptionsText, setEditingOptionsText] = useState(''); // 編集中の選択肢テキスト
  const persistTemplate = useCallback(async (template) => {
    if (!user?.id) return;
    try {
      await supabaseRest('/rest/v1/prompt_templates', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: {
          id: template.id,
          user_id: user.id,
          name: template.name,
          yaml: template.yaml || {},
          original_prompt: template.originalPrompt || '',
          field_options: template.fieldOptions || {},
          created_at: template.createdAt || new Date().toISOString(),
        },
        accessToken: supabaseToken,
      });
    } catch (err) {
      console.error('テンプレートの保存に失敗しました', err);
    }
  }, [user?.id, supabaseToken]);

  useEffect(() => {
    if (!user?.id || !supabaseToken) {
      setTemplates([]);
      return;
    }

    let active = true;

    const fetchTemplates = async () => {
      try {
        const rows = await supabaseRest(`/rest/v1/prompt_templates?user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.desc`, {
          accessToken: supabaseToken,
        });
        if (!active) return;
        setTemplates(Array.isArray(rows)
          ? rows.map(row => ({
              id: row.id,
              name: row.name,
              yaml: row.yaml || {},
              originalPrompt: row.original_prompt || '',
              fieldOptions: row.field_options || {},
              createdAt: row.created_at,
            }))
          : []);
      } catch (err) {
        console.error('テンプレートの取得に失敗しました', err);
      }
    };

    fetchTemplates();

    return () => {
      active = false;
    };
  }, [user?.id, supabaseToken]);

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

    const systemPrompt = `あなたは画像生成プロンプトを構造化YAMLに変換する専門家です。
入力されたプロンプトを分析し、以下の構造でJSON形式で返してください。

構造:
{
  "format": {
    "aspectRatio": "16:9" (または "1:1", "3:4", "4:3", "9:16" など、プロンプトから抽出),
    "style": "raw" (または "photorealistic", "anime" など、--styleパラメータから抽出)
  },
  "background": {
    "color": "色の説明",
    "description": "背景の説明"
  },
  "subject": {
    "description": "被写体の説明",
    "gender": "男性/女性/その他",
    "age": "年齢の説明"
  },
  "style": {
    "type": "スタイルの種類（photorealistic, anime, watercolor など）",
    "aesthetic": "美的スタイル"
  },
  "mood": {
    "description": "雰囲気やムードの説明"
  },
  "typography": {
    "text": "テキスト内容",
    "font_style": "フォントスタイル"
  }
}

注意事項:
- プロンプトに含まれていない情報は、そのキーを省略してください
- 技術的パラメータ（--ar, --styleなど）はformatセクションに配置してください
- JSON形式のみを返し、説明文は含めないでください
- 値が不明な場合は空文字列ではなく、そのキー自体を省略してください`;

    const userPrompt = `以下のプロンプトを構造化YAMLに変換してください:\n\n${prompt}`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // または 'gpt-4o', 'gpt-3.5-turbo' など
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
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

  // YAMLからプロンプトを生成
  const generatePromptFromYaml = (yaml) => {
    const parts = [];
    
    if (yaml.subject?.description) {
      parts.push(yaml.subject.description);
    }
    if (yaml.background?.color) {
      parts.push(`color: ${yaml.background.color}`);
    }
    if (yaml.style?.type) {
      parts.push(`style: ${yaml.style.type}`);
    }
    if (yaml.mood?.description) {
      parts.push(`mood: ${yaml.mood.description}`);
    }
    if (yaml.format?.aspectRatio) {
      parts.push(`--ar ${yaml.format.aspectRatio}`);
    }
    if (yaml.format?.style) {
      parts.push(`--style ${yaml.format.style}`);
    }

    return parts.join(', ');
  };

  // テンプレートを保存
  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      alert('テンプレート名を入力してください');
      return;
    }

    const newTemplate = {
      id: Date.now().toString(),
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
      alert('プロンプトが生成されていません');
      return;
    }

    const generatedPrompt = generatePromptFromYaml(yamlData);
    if (!generatedPrompt.trim()) {
      alert('プロンプトが空です');
      return;
    }

    const styleName = window.prompt('スタイル名を入力してください:', templateName || 'プロンプト ' + new Date().toLocaleString('ja-JP'));
    if (!styleName || !styleName.trim()) {
      return;
    }

    const newStyle = {
      id: Date.now().toString(),
      name: styleName.trim(),
      prompt: generatedPrompt,
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
                >
                  <h3>{template.name}</h3>
                  <p className="template-date">{new Date(template.createdAt).toLocaleDateString('ja-JP')}</p>
                </div>
              ))
            )}
          </div>
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
                      <div className="mode-indicator">
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
