import React, { memo } from 'react';

// Props interface for StyleItem component
const StyleItemProps = {
  style: {
    id: 'string',
    name: 'string',
    prompt: 'string',
    thumbnail: 'string'
  },
  isExpanded: 'boolean',
  isEditing: 'boolean',
  editStyleName: 'string',
  editStylePrompt: 'string',
  onToggle: 'function',
  onEdit: 'function',
  onDelete: 'function',
  onApplyStyleAsYaml: 'function',
  onUpdateStyle: 'function',
  onCancelEdit: 'function',
  setEditStyleName: 'function',
  setEditStylePrompt: 'function'
};

const StyleItem = memo(({
  style,
  isExpanded,
  isEditing,
  editStyleName,
  editStylePrompt,
  onToggle,
  onEdit,
  onDelete,
  onApplyStyleAsYaml,
  onUpdateStyle,
  onCancelEdit,
  setEditStyleName,
  setEditStylePrompt
}) => {
  const handleToggle = () => {
    onToggle(style.id);
  };

  const handleEdit = () => {
    onEdit(style.id);
  };

  const handleDelete = () => {
    onDelete(style.id);
  };

  const handleApply = () => {
    onApplyStyleAsYaml(style);
  };

  const handleUpdateSubmit = (e) => {
    e.preventDefault();
    onUpdateStyle(e);
  };

  const handleCancelEdit = () => {
    onCancelEdit();
  };

  const handleEditClick = (e) => {
    e.stopPropagation();
    handleEdit();
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    handleDelete();
  };

  const handleActionsClick = (e) => {
    e.stopPropagation();
  };

  if (isEditing) {
    return (
      <div className="style-item">
        <form onSubmit={handleUpdateSubmit} className="add-style-form">
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
              onClick={handleCancelEdit}
              className="cancel-style-button"
            >
              キャンセル
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="style-item">
      <div 
        className="style-item-header"
        onClick={handleToggle}
        style={{ cursor: 'pointer' }}
      >
        <span className="toggle-icon" style={{ marginRight: '8px' }}>
          {isExpanded ? '▼' : '▶'}
        </span>
        <h3>{style.name}</h3>
        <div className="style-item-actions" onClick={handleActionsClick}>
          <button
            onClick={handleEditClick}
            className="edit-style-button"
            title="編集"
          >
            ✏️
          </button>
          <button
            onClick={handleDeleteClick}
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
            onClick={handleApply}
            className="apply-style-button"
          >
            適用
          </button>
        </div>
      )}
    </div>
  );
});

// Custom comparison function for React.memo
const arePropsEqual = (prevProps, nextProps) => {
  // Check if the style object has changed
  if (
    prevProps.style.id !== nextProps.style.id ||
    prevProps.style.name !== nextProps.style.name ||
    prevProps.style.prompt !== nextProps.style.prompt ||
    prevProps.style.thumbnail !== nextProps.style.thumbnail
  ) {
    return false;
  }

  // Check if expansion or editing state has changed
  if (
    prevProps.isExpanded !== nextProps.isExpanded ||
    prevProps.isEditing !== nextProps.isEditing
  ) {
    return false;
  }

  // Check if editing values have changed (only relevant when isEditing is true)
  if (
    prevProps.isEditing &&
    (prevProps.editStyleName !== nextProps.editStyleName ||
     prevProps.editStylePrompt !== nextProps.editStylePrompt)
  ) {
    return false;
  }

  // All other props are functions that should be stable due to useCallback
  return true;
};

// Apply the custom comparison function
const MemoizedStyleItem = memo(StyleItem, arePropsEqual);

MemoizedStyleItem.displayName = 'StyleItem';

export default MemoizedStyleItem;