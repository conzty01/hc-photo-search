import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import { FileEdit, Loader2, Save, AlertCircle, CheckCircle, X, RefreshCw } from 'lucide-react';
import { Autocomplete } from './Autocomplete';



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
    needsReview: boolean;
    hasPhotos: boolean;
    lastIndexedUtc: string;
}

interface OrderEditorCardProps {
    onOrderUpdate?: (orderId: string, needsReview: boolean) => void;
}

export const OrderEditorCard: React.FC<OrderEditorCardProps> = ({ onOrderUpdate }) => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [orderNumber, setOrderNumber] = useState<string>('');

    // Editor Modes
    const [mode, setMode] = useState<'visual' | 'json'>('visual');

    // JSON State
    const [jsonContent, setJsonContent] = useState<string>('');
    const [originalJsonContent, setOriginalJsonContent] = useState<string>('');

    // Visual State
    const [visualOrder, setVisualOrder] = useState<OrderMeta | null>(null);
    const [newOptionKey, setNewOptionKey] = useState('');
    const [newOptionValue, setNewOptionValue] = useState('');

    // Autocomplete State
    const [optionKeySuggestions, setOptionKeySuggestions] = useState<string[]>([]);
    const [optionValueSuggestions, setOptionValueSuggestions] = useState<string[]>([]);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [reindexing, setReindexing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // Sync helpers
    const syncJsonToVisual = (json: string) => {
        try {
            const meta = JSON.parse(json);
            setVisualOrder(meta);
        } catch (e) {
            // If JSON is invalid, we can't sync to visual. 
            // In a real app we might want to disable the visual tab or show an error.
        }
    };

    const syncVisualToJson = (order: OrderMeta) => {
        const json = JSON.stringify(order, null, 2);
        setJsonContent(json);
    };

    const loadOrder = useCallback(async (id: string) => {
        if (!id.trim()) {
            setError('Please enter an order number');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await axios.get<OrderMeta>(`/orders/${id.trim()}`);
            const json = JSON.stringify(response.data, null, 2);
            setJsonContent(json);
            setOriginalJsonContent(json);
            setVisualOrder(response.data);
            setError(null);
            // Ensure state matches what we just loaded
            setOrderNumber(id.trim());
        } catch (err: any) {
            if (err.response?.status === 404) {
                setError(`Order ${id.trim()} not found`);
            } else {
                setError('Failed to load order: ' + (err.response?.data?.detail || err.message));
            }
            setJsonContent('');
            setVisualOrder(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const clearEditor = useCallback(() => {
        setOrderNumber('');
        setJsonContent('');
        setOriginalJsonContent('');
        setVisualOrder(null);
        setError(null);
        setShowClearConfirm(false);
        // Also clear the URL parameter to prevent useEffect from reloading
        navigate('/admin', { replace: true });
    }, [navigate]);

    const handleLoad = () => {
        loadOrder(orderNumber);
    };

    useEffect(() => {
        const orderIdParam = searchParams.get('orderId');
        if (orderIdParam) {
            loadOrder(orderIdParam);
        }
    }, [searchParams, loadOrder]);

    const handleSave = async () => {
        // If we are in visual mode, ensure JSON is up to date before saving
        let contentToSave = jsonContent;
        if (mode === 'visual' && visualOrder) {
            // Clean keywords before saving: trim whitespace and remove empty lines
            const cleanedOrder = {
                ...visualOrder,
                keywords: visualOrder.keywords
                    ? visualOrder.keywords.map(k => k.trim()).filter(k => k !== '')
                    : []
            };
            contentToSave = JSON.stringify(cleanedOrder, null, 2);
        }

        if (!contentToSave.trim()) {
            showNotification('error', 'No content to save');
            return;
        }

        // Validate JSON
        let orderMeta: OrderMeta;
        try {
            orderMeta = JSON.parse(contentToSave);
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

            // Update the JSON content with the response to get the updated timestamp
            const updatedJson = JSON.stringify(response.data.orderMeta, null, 2);
            setJsonContent(updatedJson);
            setOriginalJsonContent(updatedJson);
            setVisualOrder(response.data.orderMeta);

            showNotification('success', 'Order updated successfully!');
            if (onOrderUpdate) {
                onOrderUpdate(response.data.orderMeta.orderNumber, response.data.orderMeta.needsReview);
            }
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

    const handleReindex = async () => {
        if (!orderNumber.trim()) {
            showNotification('error', 'No order loaded');
            return;
        }

        setReindexing(true);

        try {
            const response = await axios.post(`/admin/orders/${orderNumber.trim()}/reindex`);

            // Update the JSON content with the response
            const updatedJson = JSON.stringify(response.data.orderMeta, null, 2);
            setJsonContent(updatedJson);
            setOriginalJsonContent(updatedJson);
            setVisualOrder(response.data.orderMeta);

            showNotification('success', 'Order reindexed successfully from Volusion!');
            if (onOrderUpdate) {
                onOrderUpdate(response.data.orderMeta.orderNumber, response.data.orderMeta.needsReview);
            }
        } catch (err: any) {
            if (err.response?.status === 404) {
                showNotification('error', err.response.data.message || `Order ${orderNumber.trim()} not found`);
            } else if (err.response?.status === 500) {
                showNotification('error', err.response.data.detail || 'Failed to fetch data from Volusion. Please try again later.');
            } else {
                showNotification('error', 'Failed to reindex: ' + (err.response?.data?.detail || err.message));
            }
        } finally {
            setReindexing(false);
        }
    };

    const showNotification = (type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleLoad();
        }
    };

    const hasUnsavedChanges = () => {
        // Simple check based on current strings
        // Ideally strict comparison of objects
        return jsonContent !== '' && jsonContent !== originalJsonContent;
    };

    const handleClear = () => {
        if (hasUnsavedChanges()) {
            setShowClearConfirm(true);
        } else {
            clearEditor();
        }
    };

    // Autocomplete Fetching
    const fetchSuggestions = useCallback(async (field: string, filter?: string) => {
        try {
            const params: any = { field };
            if (filter) params.filter = filter;

            const response = await axios.get<{ [key: string]: string[] }>('/search/autocomplete-values', { params });
            return response.data[field] || [];
        } catch (err) {
            console.error('Failed to fetch suggestions', err);
            return [];
        }
    }, []);

    // Load initial suggestions
    useEffect(() => {
        if (mode === 'visual') {
            fetchSuggestions('options.key').then(setOptionKeySuggestions);
        }
    }, [mode, fetchSuggestions]);

    // Load value suggestions when key changes
    useEffect(() => {
        if (newOptionKey && mode === 'visual') {
            // Filter values based on the specific key
            // Note: Api expects filter format compatible with Meilisearch
            // e.g. "options.key = 'Finish'"
            // We need to be careful with escaping quotes
            const safeKey = newOptionKey.replace(/'/g, "\\'");
            fetchSuggestions('options.value', `options.key = '${safeKey}'`).then(setOptionValueSuggestions);
        } else {
            setOptionValueSuggestions([]);
        }
    }, [newOptionKey, mode, fetchSuggestions]);

    // Tab switching logic
    const switchMode = (newMode: 'visual' | 'json') => {
        if (newMode === mode) return;

        if (newMode === 'visual') {
            // Switching JSON -> Visual
            syncJsonToVisual(jsonContent);
            setMode('visual');
        } else {
            // Switching Visual -> JSON
            if (visualOrder) {
                // Clean keywords before syncing to JSON
                const cleanedOrder = {
                    ...visualOrder,
                    keywords: visualOrder.keywords
                        ? visualOrder.keywords.map(k => k.trim()).filter(k => k !== '')
                        : []
                };
                syncVisualToJson(cleanedOrder);
                setMode('json');
            }
        }
    };

    return (
        <div className="admin-card order-editor-card">
            <div className="card-title-row">
                <h2>
                    <FileEdit size={20} />
                    Order Editor
                </h2>
                <div className="mode-toggle">
                    <button
                        className={`toggle-btn ${mode === 'visual' ? 'active' : ''}`}
                        onClick={() => switchMode('visual')}
                        disabled={!jsonContent && !visualOrder && !orderNumber}
                    >
                        Visual
                    </button>
                    <button
                        className={`toggle-btn ${mode === 'json' ? 'active' : ''}`}
                        onClick={() => switchMode('json')}
                        disabled={!jsonContent && !visualOrder && !orderNumber}
                    >
                        JSON
                    </button>
                </div>
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

            {/* Visual Editor */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateRows: mode === 'visual' && visualOrder ? '1fr' : '0fr',
                    transition: 'grid-template-rows 0.4s ease-out'
                }}
            >
                <div style={{ overflow: 'hidden' }}>
                    {visualOrder && (
                        <div className="visual-editor-container" style={{ paddingTop: '16px' }}>
                            {/* Order Details Header */}
                            <div className="visual-section">
                                <h3>Order Details</h3>
                                <div className="details-grid">
                                    <div className="details-row">
                                        <div className="field-group">
                                            <label>Order Number</label>
                                            <input type="text" value={visualOrder.orderNumber} disabled className="readonly-input" />
                                        </div>
                                        <div className="field-group">
                                            <label>Date</label>
                                            <input type="text" value={new Date(visualOrder.orderDate).toLocaleDateString()} disabled className="readonly-input" />
                                        </div>
                                    </div>
                                    <div className="field-group">
                                        <label>Product Name</label>
                                        <input
                                            type="text"
                                            value={visualOrder.productName}
                                            onChange={(e) => setVisualOrder({ ...visualOrder, productName: e.target.value })}
                                            className="order-input"
                                        />
                                    </div>
                                    <div className="details-row">
                                        <div className="field-group">
                                            <label>Product Code</label>
                                            <input
                                                type="text"
                                                value={visualOrder.productCode}
                                                onChange={(e) => setVisualOrder({ ...visualOrder, productCode: e.target.value })}
                                                className="order-input"
                                            />
                                        </div>
                                        <div className="field-group">
                                            <label>Product ID</label>
                                            <input
                                                type="text"
                                                value={visualOrder.productId}
                                                onChange={(e) => setVisualOrder({ ...visualOrder, productId: e.target.value })}
                                                className="order-input"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Comments */}
                            <div className="visual-section">
                                <h3>Comments</h3>
                                <textarea
                                    className="comments-textarea"
                                    value={visualOrder.orderComments || ''}
                                    onChange={(e) => setVisualOrder({ ...visualOrder, orderComments: e.target.value })}
                                    placeholder="No comments..."
                                    rows={6}
                                />
                            </div>

                            {/* Options */}
                            <div className="visual-section">
                                <h3>Options</h3>
                                <div className="options-list-editor">
                                    {visualOrder.options?.map((opt, i) => (
                                        <div key={i} className="option-row">
                                            <input
                                                className="order-input"
                                                value={opt.key}
                                                onChange={(e) => {
                                                    const newOptions = [...visualOrder.options];
                                                    newOptions[i] = { ...opt, key: e.target.value };
                                                    setVisualOrder({ ...visualOrder, options: newOptions });
                                                }}
                                            />
                                            <span className="separator">:</span>
                                            <input
                                                className="order-input"
                                                value={opt.value}
                                                onChange={(e) => {
                                                    const newOptions = [...visualOrder.options];
                                                    newOptions[i] = { ...opt, value: e.target.value };
                                                    setVisualOrder({ ...visualOrder, options: newOptions });
                                                }}
                                            />
                                            <button
                                                onClick={() => {
                                                    const newOptions = visualOrder.options.filter((_, idx) => idx !== i);
                                                    setVisualOrder({ ...visualOrder, options: newOptions });
                                                }}
                                                className="remove-btn"
                                                title="Remove Option"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Add New Option */}
                                    <div className="add-option-row">
                                        <Autocomplete
                                            value={newOptionKey}
                                            onChange={setNewOptionKey}
                                            onSelect={setNewOptionKey}
                                            suggestions={optionKeySuggestions}
                                            placeholder="New Option Key"
                                            className="option-key-input"
                                        />
                                        <span className="separator">:</span>
                                        <Autocomplete
                                            value={newOptionValue}
                                            onChange={setNewOptionValue}
                                            onSelect={setNewOptionValue}
                                            suggestions={optionValueSuggestions}
                                            placeholder="Value"
                                            className="option-value-input"
                                        />
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <button
                                                onClick={() => {
                                                    if (newOptionKey && newOptionValue) {
                                                        const newOptions = [...(visualOrder.options || []), { key: newOptionKey, value: newOptionValue }];
                                                        setVisualOrder({ ...visualOrder, options: newOptions });
                                                        setNewOptionKey('');
                                                        setNewOptionValue('');
                                                    }
                                                }}
                                                disabled={!newOptionKey || !newOptionValue}
                                                className="add-btn"
                                            >
                                                Add
                                            </button>
                                            {(newOptionKey || newOptionValue) && (
                                                <button
                                                    onClick={() => {
                                                        setNewOptionKey('');
                                                        setNewOptionValue('');
                                                    }}
                                                    className="remove-btn"
                                                    title="Clear Inputs"
                                                >
                                                    <X size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Keywords */}
                            <div className="visual-section">
                                <h3>Keywords</h3>
                                <textarea
                                    className="comments-textarea"
                                    value={visualOrder.keywords ? visualOrder.keywords.join('\n') : ''}
                                    onChange={(e) => {
                                        // Filter out empty lines to keep it clean, but allow trailing newline while typing
                                        // Actually simple split is better so user can type. Cleaning can happen on save?
                                        // For state sync, we'll keep all lines.
                                        const lines = e.target.value.split('\n');
                                        setVisualOrder({ ...visualOrder, keywords: lines });
                                    }}
                                    placeholder="Enter keywords (one per line)..."
                                    rows={5}
                                />
                            </div>

                            {/* Flags */}
                            <div className="visual-section">
                                <h3>Status Flags</h3>
                                <div className="flags-row">
                                    <label className="flag-label">
                                        <input
                                            type="checkbox"
                                            checked={visualOrder.isCustom}
                                            onChange={(e) => setVisualOrder({ ...visualOrder, isCustom: e.target.checked })}
                                        />
                                        Is Custom Order
                                    </label>
                                    <label className="flag-label">
                                        <input
                                            type="checkbox"
                                            checked={visualOrder.needsReview}
                                            onChange={(e) => setVisualOrder({ ...visualOrder, needsReview: e.target.checked })}
                                        />
                                        Needs Review
                                    </label>
                                </div>
                            </div>

                            {/* Footer (Shared) */}
                            <div className="editor-footer">
                                <div className="editor-footer-left">
                                    <button
                                        onClick={handleReindex}
                                        disabled={reindexing || saving || loading}
                                        className="reindex-button"
                                    >
                                        {reindexing ? (
                                            <>
                                                <Loader2 size={18} className="spinning" />
                                                Reindexing...
                                            </>
                                        ) : (
                                            <>
                                                <RefreshCw size={18} />
                                                Reindex
                                            </>
                                        )}
                                    </button>
                                </div>

                                <button
                                    onClick={handleSave}
                                    disabled={saving || reindexing || loading}
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

            {/* Monaco Editor Container with Animation */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateRows: mode === 'json' && jsonContent ? '1fr' : '0fr',
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

                            {/* Footer (Shared - duplicated for now due to container structure) */}
                            <div className="editor-footer">
                                <div className="editor-footer-left">
                                    <button
                                        onClick={handleReindex}
                                        disabled={reindexing || saving || loading}
                                        className="reindex-button"
                                    >
                                        {reindexing ? (
                                            <>
                                                <Loader2 size={18} className="spinning" />
                                                Reindexing...
                                            </>
                                        ) : (
                                            <>
                                                <RefreshCw size={18} />
                                                Reindex
                                            </>
                                        )}
                                    </button>
                                </div>

                                <button
                                    onClick={handleSave}
                                    disabled={saving || reindexing || loading}
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
