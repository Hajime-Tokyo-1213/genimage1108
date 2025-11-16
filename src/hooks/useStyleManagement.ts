import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { requireSession } from '../lib/supabaseClient';
import { handleError, logError } from '../utils/errorHandler';
import { generateUUID } from '../utils/uuid';
import { Style } from '../types';

const createDefaultStyles = (): Style[] => [
  { id: '1', name: '和風アート', prompt: '日本の伝統的な和風アートスタイル、浮世絵風、美しい色彩', thumbnail: null, source: 'manual', createdAt: new Date().toISOString() },
  { id: '2', name: '未来都市', prompt: '未来の都市、サイバーパンク、ネオンライト、高層ビル', thumbnail: null, source: 'manual', createdAt: new Date().toISOString() },
  { id: '3', name: 'ファンタジー', prompt: 'ファンタジー世界、魔法、幻想的な風景、エピックな構図', thumbnail: null, source: 'manual', createdAt: new Date().toISOString() },
  { id: '4', name: '水彩画', prompt: '水彩画スタイル、柔らかい色合い、繊細な筆使い', thumbnail: null, source: 'manual', createdAt: new Date().toISOString() },
];

interface UseStyleManagementOptions {
  onError?: (error: string) => void;
}

export const useStyleManagement = (options: UseStyleManagementOptions = {}) => {
  const { user } = useAuth();
  const [styles, setStyles] = useState<Style[]>(createDefaultStyles());
  const [stylesLoading, setStylesLoading] = useState(false);
  
  /**
   * スタイルを読み込む
   */
  const loadStyles = useCallback(async () => {
    if (!user?.id) {
      setStyles(createDefaultStyles());
      return;
    }
    
    setStylesLoading(true);
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
        const normalized: Style[] = data.map(row => {
          // promptフィールドがJSON文字列の場合はYAMLオブジェクトとして復元
          let yaml: Record<string, any> | null = null;
          let prompt = row.prompt;
          
          try {
            const parsed = JSON.parse(row.prompt);
            if (typeof parsed === 'object' && parsed !== null) {
              yaml = parsed;
            }
          } catch (e) {
            // JSON解析に失敗した場合は通常のプロンプト文字列として扱う
          }
          
          return {
            id: row.id,
            name: row.name,
            prompt: prompt,
            yaml: yaml,
            thumbnail: row.thumbnail || null,
            source: row.source || 'manual',
            createdAt: row.created_at,
          };
        });
        
        setStyles(normalized);
      } else {
        setStyles(createDefaultStyles());
      }
    } catch (err) {
      const errorMessage = handleError(err, { component: 'useStyleManagement', action: 'loadStyles' });
      logError(err, { component: 'useStyleManagement', action: 'loadStyles' });
      if (options.onError) {
        options.onError(errorMessage);
      }
      setStyles(createDefaultStyles());
    } finally {
      setStylesLoading(false);
    }
  }, [user?.id, options]);
  
  /**
   * スタイルを保存
   */
  const saveStyle = useCallback(async (style: Style) => {
    if (!user?.id) return;
    
    try {
      await requireSession(supabase);
      
      const payload = {
        id: style.id,
        user_id: user.id,
        name: style.name,
        prompt: style.yaml ? JSON.stringify(style.yaml) : style.prompt,
        thumbnail: style.thumbnail || null,
        source: style.source || 'manual',
        created_at: style.createdAt || new Date().toISOString(),
      };
      
      const { data, error } = await supabase
        .from('image_styles')
        .upsert(payload, { onConflict: 'id' });
      
      if (error) {
        throw error;
      }
      
      // スタイルリストを更新
      setStyles(prev => {
        const existing = prev.find(s => s.id === style.id);
        if (existing) {
          return prev.map(s => s.id === style.id ? style : s);
        }
        return [style, ...prev];
      });
      
      return data;
    } catch (err) {
      const errorMessage = handleError(err, { component: 'useStyleManagement', action: 'saveStyle', styleId: style.id });
      logError(err, { component: 'useStyleManagement', action: 'saveStyle', styleId: style.id });
      if (options.onError) {
        options.onError(errorMessage);
      }
      throw err;
    }
  }, [user?.id, options]);
  
  /**
   * スタイルを削除
   */
  const deleteStyle = useCallback(async (styleId: string) => {
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
      
      // スタイルリストから削除
      setStyles(prev => prev.filter(s => s.id !== styleId));
    } catch (err) {
      const errorMessage = handleError(err, { component: 'useStyleManagement', action: 'deleteStyle', styleId });
      logError(err, { component: 'useStyleManagement', action: 'deleteStyle', styleId });
      if (options.onError) {
        options.onError(errorMessage);
      }
      throw err;
    }
  }, [user?.id, options]);
  
  /**
   * スタイルを追加
   */
  const addStyle = useCallback(async (style: Omit<Style, 'id' | 'createdAt'>) => {
    const newStyle: Style = {
      ...style,
      id: generateUUID(),
      createdAt: new Date().toISOString(),
    };
    
    await saveStyle(newStyle);
    return newStyle;
  }, [saveStyle]);
  
  // ユーザーが変更されたときにスタイルを読み込む
  useEffect(() => {
    if (!user?.id) {
      setStyles(createDefaultStyles());
      return;
    }
    
    let isMounted = true;
    const fetchData = async () => {
      if (isMounted) {
        await loadStyles();
      }
    };
    
    fetchData();
    
    return () => {
      isMounted = false;
    };
  }, [user?.id]); // loadStylesを依存配列から除外（無限ループ防止）
  
  return {
    styles,
    stylesLoading,
    loadStyles,
    saveStyle,
    deleteStyle,
    addStyle,
  };
};