import { useState } from 'react';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import { FileEdit, Loader2, Save, AlertCircle, CheckCircle, X } from 'lucide-react';



interface OrderMeta {
    version: string;
    orderNumber: string;
    orderDate: string;
    customerId: string;
    orderComments: string;
    photoPath: string;
    orderUrl: string;
    productName: string;
    productId: string;
    productCode: string;
    options: Array<{ key: string; value: string }>;
    keywords: string[];
    isCustom: boolean;
    hasPhotos: boolean;
    lastIndexedUtc: string;
}

export const OrderEditorCard: React.FC = () => {
    const [orderNumber, setOrderNumber] = useState<string>('');
    const [jsonContent, setJsonContent] = useState<string>('');
    const [originalJsonContent, setOriginalJsonContent] = useState<string>('');
    const [lastModified, setLastModified] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    const handleLoad = async () => {
        if (!orderNumber.trim()) {
            setError('Please enter an order number');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await axios.get<OrderMeta>(`/orders/${orderNumber.trim()}`);
            const json = JSON.stringify(response.data, null, 2);
            setJsonContent(json);
            setOriginalJsonContent(json);
            setLastModified(response.data.lastIndexedUtc);
            setError(null);
        } catch (err: any) {
            if (err.response?.status === 404) {
                setError(`Order ${orderNumber.trim()} not found`);
            } else {
                setError('Failed to load order: ' + (err.response?.data?.detail || err.message));
            }
            setJsonContent('');
            setLastModified(null);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!jsonContent.trim()) {
            showNotification('error', 'No content to save');
            return;
        }

        // Validate JSON
        let orderMeta: OrderMeta;
        try {
            orderMeta = JSON.parse(jsonContent);
        } catch (err) {
            showNotification('error', 'Invalid JSON. Please fix syntax errors before saving.');
            return;
        }

        // Validate order number matches
        if (orderMeta.orderNumber !== orderNumber.trim()) {
            showNotification('error', `Order number in JSON (${orderMeta.orderNumber}) does not match loaded order (${orderNumber.trim()})`);
            return;
        }

        setSaving(true);

        try {
            const response = await axios.put(`/admin/orders/${orderNumber.trim()}`, orderMeta);
            setLastModified(response.data.orderMeta.lastIndexedUtc);

            // Update the JSON content with the response to get the updated timestamp
            const updatedJson = JSON.stringify(response.data.orderMeta, null, 2);
            setJsonContent(updatedJson);
            setOriginalJsonContent(updatedJson);

            showNotification('success', 'Order updated successfully!');
        } catch (err: any) {
            if (err.response?.status === 400) {
                showNotification('error', err.response.data.message || 'Invalid request');
            } else if (err.response?.status === 404) {
                showNotification('error', `Order ${orderNumber.trim()} not found`);
            } else {
                showNotification('error', 'Failed to save: ' + (err.response?.data?.detail || err.message));
            }
        } finally {
            setSaving(false);
        }
    };

    const showNotification = (type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    };

    const formatTimestamp = (timestamp: string | null) => {
        if (!timestamp) return 'Never';
        const date = new Date(timestamp);
        return date.toLocaleString();
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleLoad();
        }
    };

    const hasUnsavedChanges = () => {
        return jsonContent !== '' && jsonContent !== originalJsonContent;
    };

    const handleClear = () => {
        if (hasUnsavedChanges()) {
            setShowClearConfirm(true);
        } else {
            clearEditor();
        }
    };

    const clearEditor = () => {
        setOrderNumber('');
        setJsonContent('');
        setOriginalJsonContent('');
        setLastModified(null);
        setError(null);
        setShowClearConfirm(false);
    };

    return (
        <div className="admin-card order-editor-card">
            <div className="card-title-row">
                <h2>
                    <FileEdit size={20} />
                    Order JSON Editor
                </h2>
            </div>

            {/* Order Search */}
            <div className="editor-controls">
                <div className="order-input-wrapper">
                    <input
                        type="text"
                        value={orderNumber}
                        onChange={(e) => setOrderNumber(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Enter order number..."
                        className="order-input"
                        disabled={loading}
                    />
                    {orderNumber && (
                        <button
                            onClick={handleClear}
                            className="clear-button"
                            title="Clear"
                            type="button"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
                <button
                    onClick={handleLoad}
                    disabled={loading || !orderNumber.trim()}
                    className="load-button"
                >
                    {loading ? (
                        <>
                            <Loader2 size={18} className="spinning" />
                            Loading...
                        </>
                    ) : (
                        'Load'
                    )}
                </button>
            </div>

            {/* Error Message */}
            {error && (
                <div className="error-message">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                </div>
            )}

            {/* Monaco Editor Container with Animation */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateRows: jsonContent ? '1fr' : '0fr',
                    transition: 'grid-template-rows 0.4s ease-out'
                }}
            >
                <div style={{ overflow: 'hidden' }}>
                    {jsonContent && (
                        <div style={{ paddingTop: '16px' }}>
                            <div className="monaco-container">
                                <Editor
                                    height="400px"
                                    defaultLanguage="json"
                                    value={jsonContent}
                                    onChange={(value: string | undefined) => setJsonContent(value || '')}
                                    theme="vs-dark"
                                    options={{
                                        minimap: { enabled: false },
                                        fontSize: 13,
                                        lineNumbers: 'on',
                                        scrollBeyondLastLine: false,
                                        automaticLayout: true,
                                        tabSize: 2,
                                        formatOnPaste: true,
                                        formatOnType: true,
                                    }}
                                />
                            </div>

                            {/* Footer */}
                            <div className="editor-footer">
                                <span className="last-modified">
                                    Last Modified: {formatTimestamp(lastModified)}
                                </span>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="save-button"
                                >
                                    {saving ? (
                                        <>
                                            <Loader2 size={18} className="spinning" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Save size={18} />
                                            Save Changes
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Toast Notification */}
            {notification && (
                <div className={`toast-notification ${notification.type}`}>
                    {notification.type === 'success' ? (
                        <CheckCircle size={18} />
                    ) : (
                        <AlertCircle size={18} />
                    )}
                    <span>{notification.message}</span>
                </div>
            )}

            {/* Clear Confirmation Dialog */}
            {showClearConfirm && (
                <div className="dialog-overlay" onClick={() => setShowClearConfirm(false)}>
                    <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
                        <h3>Unsaved Changes</h3>
                        <p>
                            You have unsaved changes. Are you sure you want to clear the editor?
                        </p>
                        <div className="dialog-actions">
                            <button onClick={() => setShowClearConfirm(false)} className="btn-cancel">
                                Cancel
                            </button>
                            <button onClick={clearEditor} className="btn-confirm">
                                Yes, Clear
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
