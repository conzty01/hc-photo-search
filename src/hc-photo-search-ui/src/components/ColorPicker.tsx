import React, { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';

const DEFAULT_COLOR = '#9333ea';

// Convert hex to RGB components
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
};

// Darken a color by a percentage (for hover state)
const darkenColor = (hex: string, percent: number = 15): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;

    const r = Math.max(0, Math.floor(rgb.r * (1 - percent / 100)));
    const g = Math.max(0, Math.floor(rgb.g * (1 - percent / 100)));
    const b = Math.max(0, Math.floor(rgb.b * (1 - percent / 100)));

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

// Validate hex color format
const isValidHex = (hex: string): boolean => {
    return /^#?([a-f\d]{6})$/i.test(hex);
};

export const ColorPicker: React.FC = () => {
    const [color, setColor] = useState<string>(() => {
        const savedColor = localStorage.getItem('primaryColor');
        return savedColor || DEFAULT_COLOR;
    });

    const [hexInput, setHexInput] = useState<string>(color);

    // Update CSS variables when color changes
    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty('--primary-color', color);
        root.style.setProperty('--primary-hover', darkenColor(color));
        localStorage.setItem('primaryColor', color);
    }, [color]);

    // Handle color picker change
    const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newColor = e.target.value;
        setColor(newColor);
        setHexInput(newColor);
    };

    // Handle hex input change
    const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value;
        setHexInput(value);

        // Add # if not present
        if (!value.startsWith('#')) {
            value = '#' + value;
        }

        // Update color if valid
        if (isValidHex(value)) {
            setColor(value.toLowerCase());
        }
    };

    // Handle hex input blur - ensure format is correct
    const handleHexInputBlur = () => {
        let value = hexInput;

        // Add # if not present
        if (!value.startsWith('#')) {
            value = '#' + value;
        }

        // If invalid, revert to current color
        if (!isValidHex(value)) {
            setHexInput(color);
        } else {
            setHexInput(value.toLowerCase());
        }
    };

    return (
        <div className="appearance-row">
            <label className="appearance-label">
                <Palette size={18} />
                Primary Color
            </label>
            <div className="color-picker-group">
                <input
                    type="color"
                    value={color}
                    onChange={handleColorChange}
                    className="color-input"
                    title="Choose primary color"
                />
                <input
                    type="text"
                    value={hexInput}
                    onChange={handleHexInputChange}
                    onBlur={handleHexInputBlur}
                    className="hex-input"
                    placeholder="#9333ea"
                    maxLength={7}
                />
            </div>
        </div>
    );
};
