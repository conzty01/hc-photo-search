import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UploadPage } from './UploadPage';
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

describe('UploadPage', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('renders correctly', () => {
        render(
            <MemoryRouter>
                <UploadPage />
            </MemoryRouter>
        );
        expect(screen.getByRole('heading', { name: 'Upload Photos' })).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/e.g. 12345/i)).toBeInTheDocument();
    });

    it('displays error if order number is missing', () => {
        render(
            <MemoryRouter>
                <UploadPage />
            </MemoryRouter>
        );

        // Must add a file to enable the submit button
        const fileInput = document.getElementById('files') as HTMLInputElement;
        const file = new File(['x'], 'x.png', { type: 'image/png' });
        fireEvent.change(fileInput, { target: { files: [file] } });

        const submitButton = screen.getByRole('button', { name: /Upload Photos/i });
        fireEvent.click(submitButton);

        expect(screen.getByText('Please enter an order number.')).toBeInTheDocument();
    });

    it('disables submit button if no files are selected', () => {
        render(
            <MemoryRouter>
                <UploadPage />
            </MemoryRouter>
        );

        const input = screen.getByPlaceholderText(/e.g. 12345/i);
        fireEvent.change(input, { target: { value: '12345' } });

        const submitButton = screen.getByRole('button', { name: /Upload Photos/i });

        expect(submitButton).toBeDisabled();
    });



    // Rewriting the above test to be robust
    it('adds and removes files from the list', async () => {
        render(
            <MemoryRouter>
                <UploadPage />
            </MemoryRouter>
        );

        // We need to target the hidden file input
        // Since it has display:none, getByRole('textbox') won't work.
        // We can get it by associated label text if we are lenient, or just select by ID/selector.
        // Let's try getting by label text "Tap to select photos" which wraps the input.
        const fileInput = document.getElementById('files') as HTMLInputElement;
        expect(fileInput).toBeInTheDocument();

        const file1 = new File(['dummy content'], 'photo1.jpg', { type: 'image/jpeg' });
        const file2 = new File(['dummy content'], 'photo2.jpg', { type: 'image/jpeg' });

        fireEvent.change(fileInput, { target: { files: [file1, file2] } });

        expect(screen.getByText('Selected Files (2)')).toBeInTheDocument();
        expect(screen.getByText('photo1.jpg')).toBeInTheDocument();
        expect(screen.getByText('photo2.jpg')).toBeInTheDocument();

        // Remove photo1
        const removeButtons = screen.getAllByRole('button').filter(btn => btn.className.includes('remove-file-btn'));
        fireEvent.click(removeButtons[0]);

        expect(screen.getByText('Selected Files (1)')).toBeInTheDocument();
        expect(screen.queryByText('photo1.jpg')).not.toBeInTheDocument();
        expect(screen.getByText('photo2.jpg')).toBeInTheDocument();
    });


    it('submits form data correctly', async () => {
        mockedAxios.post.mockResolvedValue({});

        render(
            <MemoryRouter>
                <UploadPage />
            </MemoryRouter>
        );

        const orderInput = screen.getByPlaceholderText(/e.g. 12345/i);
        fireEvent.change(orderInput, { target: { value: '98765' } });

        const fileInput = document.getElementById('files') as HTMLInputElement;
        const file = new File(['img'], 'test.png', { type: 'image/png' });
        fireEvent.change(fileInput, { target: { files: [file] } });

        const submitButton = screen.getByRole('button', { name: /Upload Photos/i });

        await waitFor(() => {
            expect(submitButton).not.toBeDisabled();
        });

        fireEvent.click(submitButton);

        expect(submitButton).toHaveTextContent('Uploading...');
        expect(submitButton).toBeDisabled();

        await waitFor(() => {
            expect(mockedAxios.post).toHaveBeenCalledWith('/upload-photos', expect.any(FormData), expect.objectContaining({
                headers: { 'Content-Type': 'multipart/form-data' }
            }));
        });

        // Verify FormData
        const formData = mockedAxios.post.mock.calls[0][1];
        expect(formData.get('orderNumber')).toBe('98765');
        expect(formData.get('files')).toBe(file);

        await waitFor(() => {
            expect(screen.getByText(/Successfully uploaded 1 photos for Order #98765/i)).toBeInTheDocument();
            // Form should be cleared
            expect(orderInput).toHaveValue('');
        });
    });

    it('handles upload errors', async () => {
        mockedAxios.post.mockRejectedValue({
            response: { data: { detail: 'Invalid order number' } }
        });

        render(
            <MemoryRouter>
                <UploadPage />
            </MemoryRouter>
        );

        const orderInput = screen.getByPlaceholderText(/e.g. 12345/i);
        fireEvent.change(orderInput, { target: { value: 'fail' } });

        const fileInput = document.getElementById('files') as HTMLInputElement;
        const file = new File(['img'], 'fail.png', { type: 'image/png' });
        fireEvent.change(fileInput, { target: { files: [file] } });

        const submitButton = screen.getByRole('button', { name: /Upload Photos/i });

        await waitFor(() => {
            expect(submitButton).not.toBeDisabled();
        });

        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(screen.getByText('Invalid order number')).toBeInTheDocument();
        });

        expect(submitButton).not.toBeDisabled();
        expect(submitButton).toHaveTextContent('Upload Photos');
    });

    it('navigates back when close button is clicked', () => {
        render(
            <MemoryRouter>
                <UploadPage />
            </MemoryRouter>
        );

        const closeButton = screen.getByTitle('Back to Search');
        fireEvent.click(closeButton);

        expect(mockedNavigate).toHaveBeenCalledWith('/');
    });
});
