import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getImageArchive } from '../lib/authService.js';
import { supabase } from '../lib/supabaseClient.js';
import './ImageHistoryTable.css';

const ImageHistoryTable = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [archiveData, setArchiveData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const ITEMS_PER_PAGE = 50;

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadArchiveData();
  }, [user, page]);

  const loadArchiveData = async () => {
    try {
      setLoading(true);
      setError(null);
      const offset = page * ITEMS_PER_PAGE;
      const data = await getImageArchive(supabase, ITEMS_PER_PAGE, offset);
      setArchiveData(prev => page === 0 ? data : [...prev, ...data]);
      setHasMore(data.length === ITEMS_PER_PAGE);
    } catch (err) {
      console.error('アーカイブデータの読み込みエラー:', err);
      // 404エラーの場合、テーブルが存在しない可能性がある
      if (err.code === 'PGRST116' || err.message?.includes('404') || err.message?.includes('relation') || err.message?.includes('does not exist')) {
        setError('画像履歴アーカイブテーブルが存在しません。Supabaseでマイグレーションファイル（migration_create_image_history_archive.sql）を実行してください。');
      } else {
        setError('データの読み込みに失敗しました: ' + (err.message || '不明なエラー'));
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleRowExpansion = (id) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (err) {
      return dateString;
    }
  };

  const getImageDataUrl = (base64Data) => {
    if (!base64Data) return null;
    // base64データが既にdata:image形式の場合はそのまま返す
    if (base64Data.startsWith('data:')) {
      return base64Data;
    }
    // base64文字列のみの場合は、data:image/png;base64,を付ける
    return `data:image/png;base64,${base64Data}`;
  };

  const downloadImage = (base64Data, id) => {
    const dataUrl = getImageDataUrl(base64Data);
    if (!dataUrl) return;
    
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `image-${id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyBase64 = (base64Data) => {
    if (!base64Data) return;
    const fullDataUrl = getImageDataUrl(base64Data);
    navigator.clipboard.writeText(fullDataUrl).then(() => {
      alert('Base64データをクリップボードにコピーしました');
    }).catch(err => {
      console.error('コピーに失敗しました:', err);
      alert('コピーに失敗しました');
    });
  };

  if (loading && archiveData.length === 0) {
    return (
      <div className="image-history-table-container">
        <div className="loading">読み込み中...</div>
      </div>
    );
  }

  if (error && archiveData.length === 0) {
    return (
      <div className="image-history-table-container">
        <div className="error">{error}</div>
        <button onClick={() => navigate('/image-generator')} className="back-button">
          画像生成ページに戻る
        </button>
      </div>
    );
  }

  return (
    <div className="image-history-table-container">
      <div className="image-history-table-header">
        <h1>📋 画像生成履歴アーカイブ</h1>
        <button onClick={() => navigate('/image-generator')} className="back-button">
          ← 画像生成ページに戻る
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="table-info">
        <p>全{archiveData.length}件の履歴が保存されています（画像を削除してもこのデータは残ります）</p>
      </div>

      <div className="table-wrapper">
        <table className="image-history-table">
          <thead>
            <tr>
              <th style={{ width: '80px' }}>画像</th>
              <th style={{ width: '150px' }}>作成日時</th>
              <th>プロンプト</th>
              <th style={{ width: '100px' }}>タイトル</th>
              <th style={{ width: '200px' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {archiveData.length === 0 ? (
              <tr>
                <td colSpan="5" className="no-data">
                  履歴データがありません
                </td>
              </tr>
            ) : (
              archiveData.map((item) => {
                const isExpanded = expandedRows.has(item.id);
                const imageUrl = getImageDataUrl(item.image_base64);
                const promptPreview = item.prompt ? 
                  (item.prompt.length > 100 ? item.prompt.substring(0, 100) + '...' : item.prompt) : 
                  '-';

                return (
                  <React.Fragment key={item.id}>
                    <tr className={isExpanded ? 'expanded' : ''}>
                      <td>
                        {imageUrl ? (
                          <img 
                            src={imageUrl} 
                            alt="生成画像" 
                            className="thumbnail-image"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'block';
                            }}
                          />
                        ) : (
                          <div className="no-image">画像なし</div>
                        )}
                        {imageUrl && (
                          <div className="image-error" style={{ display: 'none' }}>
                            画像読み込みエラー
                          </div>
                        )}
                      </td>
                      <td>{formatDate(item.created_at)}</td>
                      <td>
                        <div className="prompt-cell">
                          {isExpanded ? (
                            <div className="prompt-full">{item.prompt || '-'}</div>
                          ) : (
                            <div className="prompt-preview">{promptPreview}</div>
                          )}
                          {item.prompt && item.prompt.length > 100 && (
                            <button 
                              className="toggle-prompt-btn"
                              onClick={() => toggleRowExpansion(item.id)}
                            >
                              {isExpanded ? '折りたたむ' : '全文表示'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td>{item.title || '-'}</td>
                      <td>
                        <div className="action-buttons">
                          {imageUrl && (
                            <>
                              <button 
                                className="action-btn download-btn"
                                onClick={() => downloadImage(item.image_base64, item.id)}
                                title="画像をダウンロード"
                              >
                                💾
                              </button>
                              <button 
                                className="action-btn copy-btn"
                                onClick={() => copyBase64(item.image_base64)}
                                title="Base64をコピー"
                              >
                                📋
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="load-more-container">
          <button 
            onClick={() => setPage(prev => prev + 1)} 
            className="load-more-button"
            disabled={loading}
          >
            {loading ? '読み込み中...' : 'さらに読み込む'}
          </button>
        </div>
      )}

      {loading && archiveData.length > 0 && (
        <div className="loading-more">読み込み中...</div>
      )}
    </div>
  );
};

export default ImageHistoryTable;

