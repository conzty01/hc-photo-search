import React, { useState } from 'react';

interface OrderOptionsProps {
    options: { key: string; value: string }[];
}

export const OrderOptions: React.FC<OrderOptionsProps> = ({ options }) => {
    const [expanded, setExpanded] = useState(false);
    const LIMIT = 3;

    if (options.length <= LIMIT) {
        return (
            <div className="options-list">
                {options.map((opt, i) => (
                    <div key={i} className="option-item">
                        <span className="opt-key">{opt.key}:</span> {opt.value}
                    </div>
                ))}
            </div>
        );
    }

    const initialOptions = options.slice(0, LIMIT);
    const remainingOptions = options.slice(LIMIT);
    const remainingCount = options.length - LIMIT;

    return (
        <div className="options-container">
            {/* Always show first 3 options */}
            <div className="options-list" style={{ marginBottom: 0 }}>
                {initialOptions.map((opt, i) => (
                    <div key={i} className="option-item">
                        <span className="opt-key">{opt.key}:</span> {opt.value}
                    </div>
                ))}
            </div>

            {/* Animate remaining options */}
            <div
                className="options-grid"
                style={{
                    display: 'grid',
                    gridTemplateRows: expanded ? '1fr' : '0fr',
                    transition: 'grid-template-rows 0.3s ease-out'
                }}
            >
                <div style={{ overflow: 'hidden' }}>
                    <div className="options-list">
                        {remainingOptions.map((opt, i) => (
                            <div key={i + LIMIT} className="option-item">
                                <span className="opt-key">{opt.key}:</span> {opt.value}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <button
                onClick={() => setExpanded(!expanded)}
                className="option-more-btn"
            >
                {expanded ? "Show less" : `+${remainingCount} more options`}
            </button>
        </div>
    );
};
