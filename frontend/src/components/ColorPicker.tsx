import React from 'react';
import { NODE_COLORS } from '../types/mindmap';

interface ColorPickerProps {
  currentColor: string;
  onSelect: (color: string) => void;
  onClose: () => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ currentColor, onSelect, onClose }) => {
  return (
    <div
      className="absolute z-50 bg-white rounded-xl shadow-xl border border-slate-200 p-4 w-max"
      onMouseLeave={onClose}
    >
      <p className="text-xs text-slate-500 mb-3 font-medium whitespace-nowrap">カラーを選択</p>
      <div className="grid grid-cols-5 gap-3">
        {NODE_COLORS.map(color => (
          <button
            key={color}
            onClick={() => { onSelect(color); onClose(); }}
            className={`w-10 h-10 rounded-full transition-transform hover:scale-110 ${currentColor === color ? 'ring-2 ring-offset-2 ring-slate-500 scale-110' : ''
              }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
    </div>
  );
};
