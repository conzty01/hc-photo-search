import { render } from '@testing-library/react';
import { describe, it } from 'vitest';
import App from './App';

describe('App Component', () => {
    it('renders without crashing', () => {
        render(
            <App />
        );
        // You might need to adjust this depending on what's actually in your App component
        // For now, just rendering is a good start. 
        // If you have a specific text like "Search" or a specific header, we can check for that.
    });
});
