import React, { memo, useState, useCallback } from 'react';

const HistoryItem = memo(({
  image,
  isActive,
  isSelected,
  editingTitleId,
  editingTitle,
  onCheckboxChange,
  onImageClick,
  onDeleteImage,
  onStartEditTitle,
  onSaveTitle,
  onCancelEditTitle,
  onTitleChange,
  onDragStart,
  onShowQuickLook
}) => {
  const [imageError, setImageError] = useState(false);

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (editingTitleId === image.id) {
      if (e.key === 'Enter') {
        e.preventDefault();
        onSaveTitle(image.id, editingTitle);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancelEditTitle();
      }
    }
  }, [editingTitleId, image.id, editingTitle, onSaveTitle, onCancelEditTitle]);

  const isEditing = editingTitleId === image.id;
  const imageSource = image.fullImageUrl || image.imageUrl || image.thumbnailUrl;

  return (
    <div
      className={`history-item ${isActive ? 'active' : ''}`}
    >
      <div className="history-item-header">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onCheckboxChange(image.id);
          }}
          className="history-checkbox"
          onClick={(e) => e.stopPropagation()}
        />
        <span className="history-date">
          {new Date(image.createdAt).toLocaleString('ja-JP')}
          {image.revision > 0 && (
            <span className="revision-badge">v{image.revision + 1}</span>
          )}
        </span>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDeleteImage(image.id, e);
          }}
          className="delete-image-button"
          title="削除"
          type="button"
        >
          ×
        </button>
      </div>

      <div className="history-image-wrapper">
        {imageSource && !imageError ? (
          <img
            src={imageSource}
            alt="生成された画像"
            onError={handleImageError}
            onClick={() => onShowQuickLook(image)}
            draggable="true"
            onDragStart={(e) => onDragStart(e, image.id)}
          />
        ) : (
          <div className="no-image">画像なし</div>
        )}
      </div>

      {isEditing ? (
        <input
          type="text"
          value={editingTitle}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => onSaveTitle(image.id, editingTitle)}
          className="title-input"
          autoFocus
        />
      ) : (
        <p 
          className="history-prompt"
          onClick={() => onImageClick(image.id)}
          onDoubleClick={() => onStartEditTitle(image.id, image.title || '')}
        >
          <strong>
            {image.title || `生成画像 ${new Date(image.createdAt).toLocaleDateString('ja-JP')}`}
          </strong>
          <br />
          {image.prompt ? (
            image.prompt.length > 80 ? 
              `${image.prompt.substring(0, 80)}...` : 
              image.prompt
          ) : 'プロンプトなし'}
          {image.saved && <span className="saved-indicator"> ✓ 保存済み</span>}
        </p>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // カスタム比較関数：関連するプロパティのみをチェック
  return (
    prevProps.image.id === nextProps.image.id &&
    prevProps.image.saved === nextProps.image.saved &&
    prevProps.image.title === nextProps.image.title &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.editingTitleId === nextProps.editingTitleId &&
    prevProps.editingTitle === nextProps.editingTitle
  );
});

HistoryItem.displayName = 'HistoryItem';

export default HistoryItem;