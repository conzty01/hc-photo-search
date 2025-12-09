import { useState, useRef } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import axios from 'axios';
import { Upload, X, Check, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const UploadPage: React.FC = () => {
    const navigate = useNavigate();
    const [orderNumber, setOrderNumber] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            // Append new files to existing ones
            setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        if (!orderNumber.trim()) {
            setStatus('error');
            setMessage('Please enter an order number.');
            return;
        }

        if (files.length === 0) {
            setStatus('error');
            setMessage('Please select at least one photo.');
            return;
        }

        setStatus('uploading');
        setMessage('');

        const formData = new FormData();
        formData.append('orderNumber', orderNumber.trim());
        files.forEach(file => {
            formData.append('files', file);
        });

        try {
            await axios.post('/upload-photos', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            setStatus('success');
            setMessage(`Successfully uploaded ${files.length} photos for Order #${orderNumber}.`);
            // Clear form
            setFiles([]);
            setOrderNumber('');
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (error: any) {
            setStatus('error');
            setMessage(error.response?.data?.detail || 'Failed to upload photos. Please try again.');
            console.error('Upload error:', error);
        }
    };

    return (
        <div className="container">
            <header className="header">
                <div className="header-top">
                    <h1>Upload Photos</h1>
                    <button onClick={() => navigate('/')} className="admin-button" title="Back to Search">
                        <X size={20} />
                    </button>
                </div>
            </header>

            <main className="upload-container" style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
                <form onSubmit={handleSubmit} className="upload-form">
                    <div className="form-group">
                        <label htmlFor="orderNumber">Order Number</label>
                        <input
                            type="text"
                            id="orderNumber"
                            value={orderNumber}
                            onChange={(e) => setOrderNumber(e.target.value)}
                            placeholder="e.g. 12345"
                            className="search-input"
                            style={{ width: '100%', marginBottom: '20px' }}
                            disabled={status === 'uploading'}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="files" className="file-upload-label">
                            <div className="file-upload-box">
                                <Upload size={32} />
                                <span>Tap to select photos</span>
                            </div>
                            <input
                                type="file"
                                id="files"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                multiple
                                accept="image/*"
                                style={{ display: 'none' }}
                                disabled={status === 'uploading'}
                            />
                        </label>
                    </div>

                    {files.length > 0 && (
                        <div className="file-list">
                            <h3>Selected Files ({files.length})</h3>
                            <ul className="file-list-items">
                                {files.map((file, index) => (
                                    <li key={`${file.name}-${index}`} className="file-item">
                                        <span className="file-name">{file.name}</span>
                                        <button
                                            type="button"
                                            onClick={() => removeFile(index)}
                                            className="remove-file-btn"
                                            disabled={status === 'uploading'}
                                        >
                                            <X size={16} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {message && (
                        <div className={`status-message ${status}`}>
                            {status === 'success' && <Check size={20} />}
                            {status === 'error' && <AlertCircle size={20} />}
                            <span>{message}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        className="trigger-button-unified"
                        style={{ marginTop: '20px', width: '100%' }}
                        disabled={status === 'uploading' || files.length === 0}
                    >
                        {status === 'uploading' ? 'Uploading...' : 'Upload Photos'}
                    </button>
                </form>
            </main>
        </div>
    );
};
