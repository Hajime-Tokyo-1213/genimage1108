import React, { memo } from 'react';
import StyleItem from './StyleItem';

// Props interface for StyleList component
const StyleListProps = {
  styles: 'array',
  expandedStyleIds: 'Set',
  editingStyleId: 'string',
  editStyleName: 'string',
  editStylePrompt: 'string',
  onToggleStyle: 'function',
  onEditStyle: 'function',
  onDeleteStyle: 'function',
  onApplyStyleAsYaml: 'function',
  onUpdateStyle: 'function',
  onCancelEditStyle: 'function',
  setEditStyleName: 'function',
  setEditStylePrompt: 'function'
};

const StyleList = memo(({
  styles,
  expandedStyleIds,
  editingStyleId,
  editStyleName,
  editStylePrompt,
  onToggleStyle,
  onEditStyle,
  onDeleteStyle,
  onApplyStyleAsYaml,
  onUpdateStyle,
  onCancelEditStyle,
  setEditStyleName,
  setEditStylePrompt
}) => {
  if (styles.length === 0) {
    return (
      <div className="style-list">
        <p className="empty-styles">スタイルがありません</p>
      </div>
    );
  }

  return (
    <div className="style-list">
      {styles.map((style) => (
        <StyleItem
          key={style.id}
          style={style}
          isExpanded={expandedStyleIds.has(style.id)}
          isEditing={editingStyleId === style.id}
          editStyleName={editStyleName}
          editStylePrompt={editStylePrompt}
          onToggle={onToggleStyle}
          onEdit={onEditStyle}
          onDelete={onDeleteStyle}
          onApplyStyleAsYaml={onApplyStyleAsYaml}
          onUpdateStyle={onUpdateStyle}
          onCancelEdit={onCancelEditStyle}
          setEditStyleName={setEditStyleName}
          setEditStylePrompt={setEditStylePrompt}
        />
      ))}
    </div>
  );
});

// Custom comparison function for React.memo
const arePropsEqual = (prevProps, nextProps) => {
  // Check if styles array has changed (shallow comparison)
  if (
    prevProps.styles !== nextProps.styles ||
    prevProps.styles.length !== nextProps.styles.length
  ) {
    return false;
  }

  // Check if any individual style has changed
  for (let i = 0; i < prevProps.styles.length; i++) {
    const prevStyle = prevProps.styles[i];
    const nextStyle = nextProps.styles[i];
    
    if (
      prevStyle.id !== nextStyle.id ||
      prevStyle.name !== nextStyle.name ||
      prevStyle.prompt !== nextStyle.prompt ||
      prevStyle.thumbnail !== nextStyle.thumbnail
    ) {
      return false;
    }
  }

  // Check if expansion state has changed
  if (prevProps.expandedStyleIds !== nextProps.expandedStyleIds) {
    return false;
  }

  // Check if editing state has changed
  if (
    prevProps.editingStyleId !== nextProps.editingStyleId ||
    prevProps.editStyleName !== nextProps.editStyleName ||
    prevProps.editStylePrompt !== nextProps.editStylePrompt
  ) {
    return false;
  }

  // All other props are functions that should be stable due to useCallback
  return true;
};

// Apply the custom comparison function
const MemoizedStyleList = memo(StyleList, arePropsEqual);

MemoizedStyleList.displayName = 'StyleList';

export default MemoizedStyleList;