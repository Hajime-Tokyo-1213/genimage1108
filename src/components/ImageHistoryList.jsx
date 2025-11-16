import React, { memo } from 'react';
import HistoryItem from './HistoryItem';

// Props interface for ImageHistoryList component
const ImageHistoryListProps = {
  images: 'array',
  reversedImages: 'array',
  currentImageId: 'string',
  selectedImageIds: 'Set',
  editingTitleId: 'string',
  editingTitle: 'string',
  hasMoreHistory: 'boolean',
  historyLoading: 'boolean',
  onCheckboxChange: 'function',
  onDeleteImage: 'function',
  onStartEditTitle: 'function',
  onSaveTitle: 'function',
  onDragStart: 'function',
  onShowQuickLook: 'function',
  onDownloadImage: 'function',
  onSetAsStyleThumbnail: 'function',
  onLoadHistories: 'function',
  setEditingTitleId: 'function',
  setEditingTitle: 'function'
};

const ImageHistoryList = memo(({
  images,
  reversedImages,
  currentImageId,
  selectedImageIds,
  editingTitleId,
  editingTitle,
  hasMoreHistory,
  historyLoading,
  onCheckboxChange,
  onDeleteImage,
  onStartEditTitle,
  onSaveTitle,
  onDragStart,
  onShowQuickLook,
  onDownloadImage,
  onSetAsStyleThumbnail,
  onLoadHistories,
  setEditingTitleId,
  setEditingTitle
}) => {
  const handleLoadMore = () => {
    onLoadHistories();
  };

  if (images.length === 0) {
    return (
      <div className="image-history">
        <p className="empty-history">まだ画像が生成されていません</p>
      </div>
    );
  }

  return (
    <div className="image-history">
      {reversedImages.map((img) => (
        <HistoryItem
          key={`${img.id}-${img.revision}`}
          img={img}
          currentImageId={currentImageId}
          selectedImageIds={selectedImageIds}
          editingTitleId={editingTitleId}
          editingTitle={editingTitle}
          onCheckboxChange={onCheckboxChange}
          onDeleteImage={onDeleteImage}
          onStartEditTitle={onStartEditTitle}
          onSaveTitle={onSaveTitle}
          onDragStart={onDragStart}
          onShowQuickLook={onShowQuickLook}
          onDownloadImage={onDownloadImage}
          onSetAsStyleThumbnail={onSetAsStyleThumbnail}
          setEditingTitleId={setEditingTitleId}
          setEditingTitle={setEditingTitle}
        />
      ))}
      
      {hasMoreHistory && (
        <button
          type="button"
          className="load-more-button"
          onClick={handleLoadMore}
          disabled={historyLoading}
          style={{ marginTop: '12px' }}
        >
          {historyLoading ? '読み込み中...' : 'さらに読み込む'}
        </button>
      )}
    </div>
  );
});

// Custom comparison function for React.memo
const arePropsEqual = (prevProps, nextProps) => {
  // Check if images array has changed (reference comparison first)
  if (prevProps.images !== nextProps.images) {
    return false;
  }

  // Check if reversedImages array has changed (reference comparison first)
  if (prevProps.reversedImages !== nextProps.reversedImages) {
    return false;
  }

  // Check if selection state has changed
  if (
    prevProps.currentImageId !== nextProps.currentImageId ||
    prevProps.selectedImageIds !== nextProps.selectedImageIds
  ) {
    return false;
  }

  // Check if editing state has changed
  if (
    prevProps.editingTitleId !== nextProps.editingTitleId ||
    prevProps.editingTitle !== nextProps.editingTitle
  ) {
    return false;
  }

  // Check if loading states have changed
  if (
    prevProps.hasMoreHistory !== nextProps.hasMoreHistory ||
    prevProps.historyLoading !== nextProps.historyLoading
  ) {
    return false;
  }

  // All other props are functions that should be stable due to useCallback
  return true;
};

// Apply the custom comparison function
const MemoizedImageHistoryList = memo(ImageHistoryList, arePropsEqual);

MemoizedImageHistoryList.displayName = 'ImageHistoryList';

export default MemoizedImageHistoryList;