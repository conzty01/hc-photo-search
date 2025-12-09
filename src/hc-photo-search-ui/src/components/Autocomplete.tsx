
import React, { useState, useEffect, useRef } from 'react';

/**
 * Props for the Autocomplete component
 */
interface AutocompleteProps {
    value: string;
    suggestions: string[];
    placeholder?: string;
    className?: string;
    onSelect: (value: string) => void;
    onChange: (value: string) => void;
}

/**
 * A reusable Autocomplete input component.
 * Displays a list of filtered suggestions as the user types.
 */
export const Autocomplete: React.FC<AutocompleteProps> = ({
    value,
    suggestions,
    placeholder,
    className,
    onSelect,
    onChange
}) => {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLUListElement>(null);

    useEffect(() => {
        const filtered = suggestions.filter(
            suggestion =>
                suggestion.toLowerCase().indexOf(value.toLowerCase()) > -1 &&
                suggestion !== value
        );
        setFilteredSuggestions(filtered);
    }, [value, suggestions]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value);
        setShowSuggestions(true);
    };

    const handleClick = (e: React.MouseEvent<HTMLLIElement>) => {
        setFilteredSuggestions([]);
        setShowSuggestions(false);
        onSelect(e.currentTarget.innerText);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (showSuggestions && filteredSuggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveSuggestionIndex(prev =>
                    prev < filteredSuggestions.length - 1 ? prev + 1 : prev
                );
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveSuggestionIndex(prev => (prev > 0 ? prev - 1 : 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeSuggestionIndex >= 0 && activeSuggestionIndex < filteredSuggestions.length) {
                    onSelect(filteredSuggestions[activeSuggestionIndex]);
                    setShowSuggestions(false);
                }
            } else if (e.key === 'Tab') {
                // Determine which suggestion to select: active, or the first one if none active
                const indexToSelect = activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0;
                if (indexToSelect < filteredSuggestions.length) {
                    e.preventDefault();
                    onSelect(filteredSuggestions[indexToSelect]);
                    setShowSuggestions(false);
                }
            } else if (e.key === 'Escape') {
                setShowSuggestions(false);
            }
        }
    };

    // Close suggestions on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (inputRef.current && !inputRef.current.contains(event.target as Node) &&
                suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);


    return (
        <div className={`autocomplete-wrapper ${className || ''}`}>
            <input
                type="text"
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                value={value}
                placeholder={placeholder}
                ref={inputRef}
                className="order-input" // Use the standard input class
                onFocus={() => {
                    if (value) setShowSuggestions(true);
                }}
            />
            {showSuggestions && value && filteredSuggestions.length > 0 && (
                <ul className="suggestions-list" ref={suggestionsRef}>
                    {filteredSuggestions.map((suggestion, index) => {
                        let className = "suggestion-item";
                        // Flag the active suggestion with a class
                        if (index === activeSuggestionIndex) {
                            className += " suggestion-active";
                        }
                        return (
                            <li className={className} key={suggestion} onClick={handleClick}>
                                {suggestion}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};
