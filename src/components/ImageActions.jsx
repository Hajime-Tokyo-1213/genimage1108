import React, { memo } from 'react';

// Props interface for ImageActions component
const ImageActionsProps = {
  currentImage: {
    id: 'string',
    title: 'string',
    prompt: 'string'
  },
  onDownloadImage: 'function',
  onSaveToCSV: 'function',
  onRegenerate: 'function'
};

const ImageActions = memo(({
  currentImage,
  onDownloadImage,
  onSaveToCSV,
  onRegenerate
}) => {
  const handleDownloadClick = () => {
    onDownloadImage(currentImage.id);
  };

  const handleCSVClick = () => {
    onSaveToCSV(currentImage);
  };

  const handleRegenerateClick = () => {
    onRegenerate();
  };

  if (!currentImage) {
    return null;
  }

  return (
    <div className="image-actions">
      <button
        onClick={handleDownloadClick}
        className="download-button"
      >
        💾 画像をダウンロード
      </button>
      
      <button
        onClick={handleCSVClick}
        className="download-button"
        style={{ marginLeft: '8px' }}
        title="画像情報をCSVファイルとしてダウンロード"
      >
        📄 CSVで保存
      </button>
      
      <button
        onClick={handleRegenerateClick}
        className="regenerate-button"
      >
        🔄 再生成
      </button>
    </div>
  );
});

// Custom comparison function for React.memo
const arePropsEqual = (prevProps, nextProps) => {
  // Quick check for null/undefined
  if (!prevProps.currentImage && !nextProps.currentImage) {
    return true;
  }
  
  if (!prevProps.currentImage || !nextProps.currentImage) {
    return false;
  }

  // Check if the currentImage has changed
  if (
    prevProps.currentImage.id !== nextProps.currentImage.id ||
    prevProps.currentImage.title !== nextProps.currentImage.title ||
    prevProps.currentImage.prompt !== nextProps.currentImage.prompt
  ) {
    return false;
  }

  // All other props are functions that should be stable due to useCallback
  return true;
};

// Apply the custom comparison function
const MemoizedImageActions = memo(ImageActions, arePropsEqual);

MemoizedImageActions.displayName = 'ImageActions';

export default MemoizedImageActions;