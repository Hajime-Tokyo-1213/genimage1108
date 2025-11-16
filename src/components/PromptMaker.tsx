import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, requireSession } from '../lib/supabaseClient';
import { handleError } from '../utils/errorHandler';
import { generateUUID } from '../utils/uuid';
import { Style } from '../types';

interface PromptMakerProps {
  onStyleCreated?: (style: Style) => void;
}

const PromptMaker: React.FC<PromptMakerProps> = ({ onStyleCreated = () => {} }) => {
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
    const context = {
      component: 'PromptMaker',
      action: 'template',
      userId: user?.id,
    };
    const userMessage = handleError(detail || message, context);
    setTemplateError(userMessage);
  }, [user?.id]);

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
      surfaceTemplateError('テンプレートの保存に失敗しました', err);
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
      surfaceTemplateError('テンプレートの削除に失敗しました', err);
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
    const newStyle: Style = {
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

export default PromptMaker;