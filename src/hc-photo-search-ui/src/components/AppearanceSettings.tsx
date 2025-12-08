import React from 'react';
import { Settings } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { ColorPicker } from './ColorPicker';

export const AppearanceSettings: React.FC = () => {
    return (
        <div className="unified-card appearance-section">
            <div className="card-title-row">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Settings size={20} />
                    Appearance
                </h2>
            </div>

            <div className="appearance-content">
                <div className="appearance-row">
                    <label className="appearance-label">Theme Mode</label>
                    <ThemeToggle />
                </div>

                <ColorPicker />
            </div>
        </div>
    );
};
