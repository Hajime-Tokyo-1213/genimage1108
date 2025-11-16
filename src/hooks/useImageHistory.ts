import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { persistImageHistory, removeImageHistory, persistImageArchive } from '../lib/authService';
import { supabase } from '../lib/supabaseClient';
import { handleError, logError } from '../utils/errorHandler';
import { ImageData } from '../types';

const HISTORY_PAGE_SIZE = 10;

interface UseImageHistoryOptions {
  onError?: (error: string) => void;
}

export const useImageHistory = (options: UseImageHistoryOptions = {}) => {
  const { user } = useAuth();
  const [images, setImages] = useState<ImageData[]>([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  /**
   * 履歴を読み込む
   */
  const loadHistories = useCallback(async ({ reset = false } = {}) => {
    if (!user?.id) {
      setImages([]);
      setHasMoreHistory(false);
      return;
    }
    
    setHistoryLoading(true);
    try {
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
      
      const normalized: ImageData[] = Array.isArray(data)
        ? data.map(row => ({
            id: row.id,
            prompt: row.prompt,
            thumbnailUrl: row.thumbnail_url,
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
        return next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      });
      
      if (reset) {
        setHistoryPage(1);
      } else {
        setHistoryPage(prev => prev + 1);
      }
      setHasMoreHistory(normalized.length === HISTORY_PAGE_SIZE);
    } catch (err) {
      const errorMessage = handleError(err, { component: 'useImageHistory', action: 'loadHistories' });
      logError(err, { component: 'useImageHistory', action: 'loadHistories' });
      if (options.onError) {
        options.onError(errorMessage);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [user?.id, historyPage, options]);
  
  /**
   * 画像履歴を保存
   */
  const saveImageHistory = useCallback(async (image: ImageData) => {
    if (!user?.id) return;
    
    try {
      await persistImageHistory(image, supabase);
      
      // アーカイブにも保存（エラーが発生しても処理は続行）
      try {
        await persistImageArchive(image, supabase);
      } catch (archiveErr) {
        console.warn('画像アーカイブの保存に失敗しました（画像は正常に生成されています）:', archiveErr);
      }
    } catch (err) {
      const errorMessage = handleError(err, { component: 'useImageHistory', action: 'saveImageHistory', imageId: image.id });
      logError(err, { component: 'useImageHistory', action: 'saveImageHistory', imageId: image.id });
      if (options.onError) {
        options.onError(errorMessage);
      }
      throw err;
    }
  }, [user?.id, options]);
  
  /**
   * 画像履歴を削除
   */
  const deleteImageHistory = useCallback(async (imageId: string) => {
    if (!user?.id) return;
    
    try {
      await removeImageHistory(imageId, supabase);
      setImages(prev => prev.filter(img => img.id !== imageId));
    } catch (err) {
      const errorMessage = handleError(err, { component: 'useImageHistory', action: 'deleteImageHistory', imageId });
      logError(err, { component: 'useImageHistory', action: 'deleteImageHistory', imageId });
      if (options.onError) {
        options.onError(errorMessage);
      }
      throw err;
    }
  }, [user?.id, options]);
  
  /**
   * 履歴をリセットして再読み込み
   */
  const refreshHistories = useCallback(() => {
    setHistoryPage(0);
    setHasMoreHistory(false);
    loadHistories({ reset: true });
  }, [loadHistories]);
  
  // ユーザーが変更されたときに履歴を読み込む
  useEffect(() => {
    if (!user?.id) {
      setImages([]);
      setHistoryPage(0);
      setHasMoreHistory(false);
      return;
    }
    
    let isMounted = true;
    const fetchData = async () => {
      setHistoryPage(0);
      setHasMoreHistory(false);
      if (isMounted) {
        await loadHistories({ reset: true });
      }
    };
    
    fetchData();
    
    return () => {
      isMounted = false;
    };
  }, [user?.id]); // loadHistoriesを依存配列から除外（無限ループ防止）
  
  return {
    images,
    historyPage,
    hasMoreHistory,
    historyLoading,
    loadHistories,
    saveImageHistory,
    deleteImageHistory,
    refreshHistories,
  };
};