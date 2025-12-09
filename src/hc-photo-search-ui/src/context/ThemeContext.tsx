import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
    primaryColor: string;
    setPrimaryColor: (color: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const DEFAULT_COLOR = '#9333ea';

// Helper functions for color manipulation
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
};

const darkenColor = (hex: string, percent: number = 15): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;

    const r = Math.max(0, Math.floor(rgb.r * (1 - percent / 100)));
    const g = Math.max(0, Math.floor(rgb.g * (1 - percent / 100)));
    const b = Math.max(0, Math.floor(rgb.b * (1 - percent / 100)));

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Theme State
    const [theme, setTheme] = useState<Theme>(() => {
        const savedTheme = localStorage.getItem('theme');
        return (savedTheme as Theme) || 'light';
    });

    // Color State
    const [primaryColor, setPrimaryColor] = useState<string>(() => {
        const savedColor = localStorage.getItem('primaryColor');
        return savedColor || DEFAULT_COLOR;
    });

    // Theme Effect
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    // Color Effect
    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty('--primary-color', primaryColor);
        root.style.setProperty('--primary-hover', darkenColor(primaryColor));
        localStorage.setItem('primaryColor', primaryColor);
    }, [primaryColor]);

    const toggleTheme = () => {
        setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, primaryColor, setPrimaryColor }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
