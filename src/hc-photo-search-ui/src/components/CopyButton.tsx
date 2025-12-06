import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
    text: string;
    className?: string;
    title?: string;
    label?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({ text, className = '', title = 'Copy', label = 'Copy' }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    return (
        <button
            onClick={handleCopy}
            className={`action-btn ${copied ? 'copied' : ''} ${className}`}
            title={title}
        >
            {copied ? (
                <>
                    <Check size={16} /> Copied!
                </>
            ) : (
                <>
                    <Copy size={16} /> {label}
                </>
            )}
        </button>
    );
};
