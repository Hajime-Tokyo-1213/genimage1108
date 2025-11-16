import React, { memo, useEffect } from 'react';

// Props interface for QuickLookModal component
const QuickLookModalProps = {
  quickLookImage: {
    id: 'string',
    title: 'string',
    prompt: 'string',
    createdAt: 'string',
    revision: 'number',
    fullImageUrl: 'string',
    imageUrl: 'string',
    thumbnailUrl: 'string'
  },
  images: 'array',
  onClose: 'function',
  onDownloadImage: 'function',
  onSaveToCSV: 'function',
  onRegenerate: 'function',
  onSetAsStyleThumbnail: 'function',
  setCurrentImageId: 'function'
};

const QuickLookModal = memo(({
  quickLookImage,
  images,
  onClose,
  onDownloadImage,
  onSaveToCSV,
  onRegenerate,
  onSetAsStyleThumbnail,
  setCurrentImageId
}) => {
  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleContentClick = (e) => {
    e.stopPropagation();
  };

  const handleDownloadClick = () => {
    onDownloadImage(quickLookImage.id);
  };

  const handleCSVClick = () => {
    const image = images.find(img => img && img.id === quickLookImage.id);
    if (image) {
      onSaveToCSV(image);
    }
  };

  const handleRegenerateClick = () => {
    setCurrentImageId(quickLookImage.id);
    onRegenerate();
    onClose();
  };

  const handleStyleThumbnailClick = () => {
    onSetAsStyleThumbnail(quickLookImage.id);
    onClose();
  };

  if (!quickLookImage) {
    return null;
  }

  const imageTitle = quickLookImage.title || `画像 ${new Date(quickLookImage.createdAt).toLocaleString('ja-JP')}`;
  const imageSrc = quickLookImage.fullImageUrl || quickLookImage.imageUrl || quickLookImage.thumbnailUrl;

  return (
    <div 
      className="quick-look-modal"
      onClick={handleBackdropClick}
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
        onClick={handleContentClick}
      >
        <button 
          className="close-button"
          onClick={onClose}
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
          src={imageSrc} 
          alt={imageTitle} 
          style={{
            maxWidth: '100%',
            height: 'auto',
            marginBottom: '16px'
          }}
        />
        
        <div className="quick-look-info">
          <h3 style={{ marginBottom: '8px' }}>
            {imageTitle}
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
              onClick={handleDownloadClick}
              className="download-button"
              style={{ padding: '8px 16px' }}
            >
              💾 ダウンロード
            </button>
            
            <button 
              onClick={handleCSVClick}
              className="download-button"
              style={{ padding: '8px 16px' }}
              title="画像情報をCSVファイルとしてダウンロード"
            >
              📄 CSVで保存
            </button>
            
            <button 
              onClick={handleRegenerateClick}
              className="regenerate-button"
              style={{ padding: '8px 16px' }}
            >
              🔄 再生成
            </button>
            
            <button 
              onClick={handleStyleThumbnailClick}
              className="set-thumbnail-button"
              style={{ padding: '8px 16px' }}
            >
              🖼️ スタイルのサムネとして使用
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

// Custom comparison function for React.memo
const arePropsEqual = (prevProps, nextProps) => {
  // Quick check for null/undefined
  if (!prevProps.quickLookImage && !nextProps.quickLookImage) {
    return true;
  }
  
  if (!prevProps.quickLookImage || !nextProps.quickLookImage) {
    return false;
  }

  // Check if the quickLookImage has changed
  if (
    prevProps.quickLookImage.id !== nextProps.quickLookImage.id ||
    prevProps.quickLookImage.title !== nextProps.quickLookImage.title ||
    prevProps.quickLookImage.prompt !== nextProps.quickLookImage.prompt ||
    prevProps.quickLookImage.createdAt !== nextProps.quickLookImage.createdAt ||
    prevProps.quickLookImage.revision !== nextProps.quickLookImage.revision ||
    prevProps.quickLookImage.fullImageUrl !== nextProps.quickLookImage.fullImageUrl ||
    prevProps.quickLookImage.imageUrl !== nextProps.quickLookImage.imageUrl ||
    prevProps.quickLookImage.thumbnailUrl !== nextProps.quickLookImage.thumbnailUrl
  ) {
    return false;
  }

  // Images array comparison (shallow check for length and reference)
  if (
    prevProps.images !== nextProps.images ||
    prevProps.images.length !== nextProps.images.length
  ) {
    return false;
  }

  // All other props are functions that should be stable due to useCallback
  return true;
};

// Apply the custom comparison function
const MemoizedQuickLookModal = memo(QuickLookModal, arePropsEqual);

MemoizedQuickLookModal.displayName = 'QuickLookModal';

export default MemoizedQuickLookModal;