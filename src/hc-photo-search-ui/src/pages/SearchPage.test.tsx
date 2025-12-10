import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchPage } from './SearchPage';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as any;

// Mock useNavigate
const mockedNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>();
    return {
        ...actual,
        useNavigate: () => mockedNavigate,
    };
});

describe('SearchPage', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        // Mock default responses
        mockedAxios.get.mockResolvedValue({
            data: { hits: [], estimatedTotalHits: 0 }
        });
    });

    it('renders search input', () => {
        render(
            <MemoryRouter>
                <SearchPage />
            </MemoryRouter>
        );
        expect(screen.getByPlaceholderText(/Search orders/i)).toBeInTheDocument();
    });

    it('updates input value on typing', () => {
        render(
            <MemoryRouter>
                <SearchPage />
            </MemoryRouter>
        );

        const input = screen.getByPlaceholderText(/Search orders/i) as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'maple' } });
        expect(input.value).toBe('maple');
    });

    it('triggers search on button click', async () => {
        // Setup mock response
        const mockHits = [{ orderNumber: '12345', productName: 'Maple Chest', options: [] }];
        mockedAxios.get.mockResolvedValueOnce({ data: { estimatedTotalHits: 0 } });
        mockedAxios.get.mockResolvedValueOnce({ data: { hits: mockHits } });

        render(
            <MemoryRouter>
                <SearchPage />
            </MemoryRouter>
        );

        const input = screen.getByPlaceholderText(/Search orders/i);
        const button = screen.getByRole('button', { name: /search/i });

        fireEvent.change(input, { target: { value: 'chest' } });
        fireEvent.click(button);

        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith('/search', expect.objectContaining({
                params: { q: 'chest' }
            }));
        });

        await waitFor(() => {
            expect(screen.getByText('#12345')).toBeInTheDocument();
            expect(screen.getByText('Maple Chest')).toBeInTheDocument();
        });
    });

    it('navigates to upload page when upload button is clicked', () => {
        render(
            <MemoryRouter>
                <SearchPage />
            </MemoryRouter>
        );

        const uploadButton = screen.getByTitle('Upload Photos');
        fireEvent.click(uploadButton);

        expect(mockedNavigate).toHaveBeenCalledWith('/upload');
    });

    it('navigates to admin page when admin button is clicked', () => {
        render(
            <MemoryRouter>
                <SearchPage />
            </MemoryRouter>
        );

        const adminButton = screen.getByTitle('Admin Panel');
        fireEvent.click(adminButton);

        expect(mockedNavigate).toHaveBeenCalledWith('/admin');
    });
});

describe('SearchPage Additional Tests', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockedAxios.get.mockResolvedValue({
            data: { hits: [], estimatedTotalHits: 0 }
        });
        // Mock clipboard
        Object.defineProperty(navigator, 'clipboard', {
            value: {
                writeText: vi.fn(),
            },
            writable: true,
        });
    });

    it('displays "Searching..." and disables button while loading', async () => {
        let resolvePromise: (value: any) => void;
        const promise = new Promise((resolve) => {
            resolvePromise = resolve;
        });

        mockedAxios.get.mockReturnValue(promise);

        render(
            <MemoryRouter>
                <SearchPage />
            </MemoryRouter>
        );

        const input = screen.getByPlaceholderText(/Search orders/i);
        const button = screen.getByRole('button', { name: /search/i });

        fireEvent.change(input, { target: { value: 'loading test' } });
        fireEvent.click(button);

        expect(button).toBeDisabled();
        expect(button).toHaveTextContent('Searching...');

        // Finish the specific search request
        resolvePromise!({ data: { hits: [] } });

        await waitFor(() => {
            expect(button).not.toBeDisabled();
            expect(button).toHaveTextContent('Search');
        });
    });

    it('displays no results message when search returns empty', async () => {
        mockedAxios.get.mockResolvedValue({ data: { hits: [], estimatedTotalHits: 0 } });

        render(
            <MemoryRouter>
                <SearchPage />
            </MemoryRouter>
        );

        const input = screen.getByPlaceholderText(/Search orders/i);
        const button = screen.getByRole('button', { name: /search/i });

        fireEvent.change(input, { target: { value: 'non-existent' } });
        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText('No orders found matching "non-existent"')).toBeInTheDocument();
        });
    });

    it('clears search state when clear button is clicked', async () => {
        render(
            <MemoryRouter>
                <SearchPage />
            </MemoryRouter>
        );

        const input = screen.getByPlaceholderText(/Search orders/i) as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'stuff' } });

        // Button appears only when there is query
        const clearButton = screen.getByTitle('Clear search');
        fireEvent.click(clearButton);

        expect(input.value).toBe('');
        // Also verify results are cleared if we had them (implicit in state reset)
    });

    it('handles API errors gracefully', async () => {
        // Suppress console.error for this test as we expect an error
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        mockedAxios.get.mockRejectedValue(new Error('API Failure'));

        render(
            <MemoryRouter>
                <SearchPage />
            </MemoryRouter>
        );

        const input = screen.getByPlaceholderText(/Search orders/i);
        const button = screen.getByRole('button', { name: /search/i });

        fireEvent.change(input, { target: { value: 'crash' } });
        fireEvent.click(button);

        await waitFor(() => {
            // Should just return to normal state (not loading)
            expect(button).not.toBeDisabled();
        });

        expect(consoleSpy).toHaveBeenCalledWith('Search failed:', expect.any(Error));
        consoleSpy.mockRestore();
    });

    it('copies path to clipboard when Copy path button is clicked', async () => {
        const mockHits = [{
            orderNumber: '55555',
            productName: 'Copy Me',
            photoPath: '\\\\server\\share\\path',
            options: []
        }];
        // First call (needs review count) + Second call (search)
        mockedAxios.get.mockResolvedValueOnce({ data: { estimatedTotalHits: 0 } });
        mockedAxios.get.mockResolvedValueOnce({ data: { hits: mockHits } });

        render(
            <MemoryRouter>
                <SearchPage />
            </MemoryRouter>
        );

        // Perform search to get result
        const input = screen.getByPlaceholderText(/Search orders/i);
        const button = screen.getByRole('button', { name: /search/i });

        fireEvent.change(input, { target: { value: 'copy' } });
        fireEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText('Copy Me')).toBeInTheDocument();
        });

        // Find and click copy button (using title from CopyButton component)
        const copyBtn = screen.getByTitle('Copy UNC Path');
        fireEvent.click(copyBtn);

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('\\\\server\\share\\path');
    });

    it('renders correct external order link', async () => {
        const mockHits = [{
            orderNumber: '999',
            productName: 'Link Test',
            orderUrl: 'http://example.com/order/999',
            options: []
        }];
        mockedAxios.get.mockResolvedValueOnce({ data: { estimatedTotalHits: 0 } });
        mockedAxios.get.mockResolvedValueOnce({ data: { hits: mockHits } });

        render(
            <MemoryRouter>
                <SearchPage />
            </MemoryRouter>
        );

        const input = screen.getByPlaceholderText(/Search orders/i);
        const button = screen.getByRole('button', { name: /search/i });

        fireEvent.change(input, { target: { value: 'link' } });
        fireEvent.click(button);

        await waitFor(() => {
            const link = screen.getByTitle('View in Volusion');
            expect(link).toHaveAttribute('href', 'http://example.com/order/999');
            expect(link).toHaveAttribute('target', '_blank');
        });
    });

    it('navigates to edit page when Edit button is clicked on a result card', async () => {
        const mockHits = [{
            orderNumber: '777',
            productName: 'Edit Test',
            options: []
        }];
        mockedAxios.get.mockResolvedValueOnce({ data: { estimatedTotalHits: 0 } });
        mockedAxios.get.mockResolvedValueOnce({ data: { hits: mockHits } });

        render(
            <MemoryRouter>
                <SearchPage />
            </MemoryRouter>
        );

        const input = screen.getByPlaceholderText(/Search orders/i);
        const button = screen.getByRole('button', { name: /search/i });

        fireEvent.change(input, { target: { value: 'edit' } });
        fireEvent.click(button);

        await waitFor(() => {
            const editBtn = screen.getByTitle('Edit Order');
            fireEvent.click(editBtn);
        });

        expect(mockedNavigate).toHaveBeenCalledWith('/admin?orderId=777');
    });
});
