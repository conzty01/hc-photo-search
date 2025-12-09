import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export const ThemeToggle: React.FC = () => {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className="theme-toggle"
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            aria-label="Toggle theme"
        >
            {theme === 'light' ? <Sun size={18} /> : <Moon size={18} />}
            <span style={{ fontSize: '0.875rem', marginLeft: '6px' }}>
                {theme === 'light' ? 'Light Mode' : 'Dark Mode'}
            </span>
        </button>
    );
};
