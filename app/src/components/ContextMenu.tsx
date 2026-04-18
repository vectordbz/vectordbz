import React, { useEffect, useRef, useState } from 'react';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuProps {
  position: ContextMenuPosition | null;
  items: MenuProps['items'];
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ position, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState<ContextMenuPosition | null>(position);

  // Adjust position to keep menu within viewport
  useEffect(() => {
    if (!position) {
      setAdjustedPosition(null);
      return;
    }

    // Initial position (will be adjusted after render)
    setAdjustedPosition(position);

    // Use requestAnimationFrame to ensure menu is rendered before measuring
    const adjustPosition = () => {
      const menuElement = menuRef.current;
      if (!menuElement) return;

      const rect = menuElement.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const padding = 8; // Padding from viewport edges

      let adjustedX = position.x;
      let adjustedY = position.y;

      // Adjust horizontal position
      if (rect.right > viewportWidth - padding) {
        // Menu goes beyond right edge, shift left
        adjustedX = Math.max(padding, viewportWidth - rect.width - padding);
      }
      if (adjustedX < padding) {
        // Menu goes beyond left edge, shift right
        adjustedX = padding;
      }

      // Adjust vertical position
      if (rect.bottom > viewportHeight - padding) {
        // Menu goes beyond bottom edge, shift up
        adjustedY = Math.max(padding, viewportHeight - rect.height - padding);
      }
      if (adjustedY < padding) {
        // Menu goes beyond top edge, shift down
        adjustedY = padding;
      }

      // Only update if position changed to avoid unnecessary re-renders
      if (adjustedX !== position.x || adjustedY !== position.y) {
        setAdjustedPosition({ x: adjustedX, y: adjustedY });
      }
    };

    // Small delay to allow menu to render and measure
    const timeoutId = setTimeout(adjustPosition, 10);
    return () => clearTimeout(timeoutId);
  }, [position]);

  // Close context menu when clicking outside, scrolling, or pressing Escape
  useEffect(() => {
    if (!position) return;

    const handleClose = () => onClose();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('click', handleClose);
    document.addEventListener('scroll', handleClose, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleClose);
      document.removeEventListener('scroll', handleClose, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [position, onClose]);

  if (!position || !adjustedPosition) return null;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        zIndex: 1050,
        boxShadow:
          '0 3px 6px -4px rgba(0,0,0,.12), 0 6px 16px 0 rgba(0,0,0,.08), 0 9px 28px 8px rgba(0,0,0,.05)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <Menu
        items={items}
        style={{ border: 'none', borderRadius: 8 }}
        mode="vertical"
        triggerSubMenuAction="hover"
      />
    </div>
  );
};

export default ContextMenu;
