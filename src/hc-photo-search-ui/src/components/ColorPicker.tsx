import React, { useState, useEffect } from 'react';
import { Palette } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

// Validate hex color format
const isValidHex = (hex: string): boolean => {
    return /^#?([a-f\d]{6})$/i.test(hex);
};

export const ColorPicker: React.FC = () => {
    const { primaryColor, setPrimaryColor } = useTheme();
    const [hexInput, setHexInput] = useState<string>(primaryColor);

    // Sync input with global color if it changes externally
    useEffect(() => {
        setHexInput(primaryColor);
    }, [primaryColor]);

    // Handle color picker change
    const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newColor = e.target.value;
        setPrimaryColor(newColor);
        // hexInput will update via effect, or we can update it here immediately for smoother feel? 
        // Effect is fine, but double render. Let's update it here.
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
            setPrimaryColor(value.toLowerCase());
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
            setHexInput(primaryColor);
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
                    value={primaryColor}
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
