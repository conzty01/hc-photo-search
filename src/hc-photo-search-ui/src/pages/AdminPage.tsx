import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, RefreshCw, AlertCircle, CheckCircle, Clock, FileWarning } from 'lucide-react';
import { OrderEditorCard } from '../components/OrderEditorCard';
import { AppearanceSettings } from '../components/AppearanceSettings';
import type { SearchResult, OrderMeta } from '../types';

interface ReindexStatus {
    isRunning: boolean;
    startTime: string | null;
    endTime: string | null;
    processedOrders: number;
    totalOrders: number;
    currentOrder: string | null;
    error: string | null;
    lastCompletedRun: string | null;
}

export const AdminPage: React.FC = () => {
    const navigate = useNavigate();
    const [status, setStatus] = useState<ReindexStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [isQueued, setIsQueued] = useState(false);
    const [needsReviewOrders, setNeedsReviewOrders] = useState<OrderMeta[]>([]);

    const editorRef = useRef<HTMLDivElement>(null);

    const fetchNeedsReviewOrders = async () => {
        try {
            const response = await axios.get<SearchResult>('/search', {
                params: { q: '', filter: 'needsReview=true', limit: 50 }
            });
            setNeedsReviewOrders(response.data.hits);
        } catch (error) {
            console.error('Failed to fetch needs review orders:', error);
        }
    };

    const handleOrderSelect = (orderNumber: string) => {
        navigate(`/admin?orderId=${orderNumber}`);
        // Small timeout to allow render to settle if needed, though react state update is batched
        setTimeout(() => {
            editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    };

    const handleOrderUpdate = (orderId: string, needsReview: boolean) => {
        // Optimistically update the list - this is instant
        if (!needsReview) {
            setNeedsReviewOrders(prev => prev.filter(o => o.orderNumber !== orderId));
        }
        // Don't immediately re-fetch as Meilisearch indexing is async
        // The list will refresh naturally when navigating or on next page load
    };

    const fetchStatus = async () => {
        try {
            const response = await axios.get<ReindexStatus>('/admin/reindex/status');
            setStatus(response.data);

            // If worker picked up the trigger, clear queued state
            if (response.data.isRunning) {
                setIsQueued(false);
            }
        } catch (error) {
            console.error('Failed to fetch reindex status:', error);
        }
    };

    useEffect(() => {
        fetchStatus();
        fetchNeedsReviewOrders();

        // Check if we loaded with an order ID, if so, scroll to editor
        const params = new URLSearchParams(window.location.search);
        if (params.get('orderId')) {
            setTimeout(() => {
                editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 500); // slightly longer delay on initial load
        }

        // Poll for status every 2 seconds
        const interval = setInterval(fetchStatus, 2000);
        return () => clearInterval(interval);
    }, []);

    const handleTriggerReindex = async () => {
        if (status?.isRunning || isQueued) {
            return;
        }

        setLoading(true);
        setShowConfirm(false);

        try {
            await axios.post('/admin/reindex');
            // Set queued state immediately after successful trigger
            setIsQueued(true);
        } catch (error: any) {
            if (error.response?.status === 409) {
                alert('Reindex is already running');
            } else {
                alert('Failed to trigger reindex: ' + (error.response?.data?.detail || error.message));
            }
        } finally {
            setLoading(false);
        }
    };

    const getProgressPercentage = () => {
        if (!status || status.totalOrders === 0) return 0;
        return Math.round((status.processedOrders / status.totalOrders) * 100);
    };

    const formatTimestamp = (timestamp: string | null) => {
        if (!timestamp) return 'Never';
        const date = new Date(timestamp);
        return date.toLocaleString();
    };

    const getRelativeTime = (timestamp: string | null) => {
        if (!timestamp) return '';
        const now = new Date();
        const then = new Date(timestamp);
        const diffMs = now.getTime() - then.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    };

    const getStatusBadge = () => {
        if (!status) return { icon: Clock, text: 'Loading...', className: 'status-idle' };
        if (status.error) return { icon: AlertCircle, text: 'Error', className: 'status-error' };
        if (status.isRunning) return { icon: RefreshCw, text: 'Running', className: 'status-running' };
        if (isQueued) return { icon: Clock, text: 'Queued', className: 'status-queued' };
        return { icon: CheckCircle, text: 'Idle', className: 'status-idle' };
    };

    const statusBadge = getStatusBadge();
    const StatusIcon = statusBadge.icon;
    const isDisabled = status?.isRunning || isQueued || loading;

    return (
        <div className="container admin-container">
            <header className="admin-header">
                <button onClick={() => navigate('/')} className="back-button">
                    <ArrowLeft size={20} />
                    Back to Search
                </button>
                <h1>Admin Panel</h1>
            </header>

            <main className="admin-content">
                {/* Needs Review Section */}
                {needsReviewOrders.length > 0 && (
                    <div className="admin-card unified-card" style={{ borderColor: '#fcd34d' }}>
                        <div className="card-title-row">
                            <h2 style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FileWarning size={20} />
                                Orders Needing Review
                            </h2>
                            <span className="badge-notification" style={{ backgroundColor: '#d97706' }}>
                                {needsReviewOrders.length}
                            </span>
                        </div>
                        <div className="review-list" style={{ maxHeight: '30vh', overflowY: 'auto', paddingRight: '4px' }}>
                            {needsReviewOrders.map(order => (
                                <button
                                    key={order.orderNumber}
                                    className="review-item"
                                    onClick={() => handleOrderSelect(order.orderNumber)}
                                    style={{
                                        display: 'flex',
                                        width: '100%',
                                        justifyContent: 'space-between',
                                        padding: '12px',
                                        marginBottom: '8px',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '8px',
                                        background: 'white',
                                        cursor: 'pointer',
                                        alignItems: 'center'
                                    }}
                                >
                                    <span className="order-number" style={{ fontWeight: 600 }}>#{order.orderNumber}</span>
                                    <span className="product-name" style={{ margin: 0, fontSize: '0.9rem' }}>
                                        {order.productName || 'Unknown Product'}
                                    </span>
                                    <span className="date" style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                                        {new Date(order.orderDate).toLocaleDateString()}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Appearance Settings Section */}
                <AppearanceSettings />

                {/* Single Unified Card */}
                <div className="admin-card unified-card">
                    <div className="card-title-row">
                        <h2>Indexing Status</h2>
                        <span className={`status-badge-icon ${statusBadge.className}`}>
                            <StatusIcon size={16} className={status?.isRunning ? 'spinning' : ''} />
                            {statusBadge.text}
                        </span>
                    </div>

                    {/* Error State */}
                    {status?.error && (
                        <div className="error-message">
                            <AlertCircle size={18} />
                            <span>{status.error}</span>
                        </div>
                    )}

                    {/* Running State - Show Progress */}
                    {status?.isRunning && !status.error && (
                        <>
                            <div className="progress-section">
                                <div className="progress-info">
                                    <span>Processing {status.processedOrders} of {status.totalOrders} orders</span>
                                    <span className="progress-percentage">{getProgressPercentage()}%</span>
                                </div>
                                <div className="progress-bar">
                                    <div
                                        className="progress-fill"
                                        style={{ width: `${getProgressPercentage()}%` }}
                                    ></div>
                                </div>
                                {status.currentOrder && (
                                    <div className="current-order">
                                        Current: Order #{status.currentOrder}
                                    </div>
                                )}
                                {status.startTime && (
                                    <div className="time-info">
                                        Started {getRelativeTime(status.startTime)}
                                    </div>
                                )}
                            </div>
                            <div className="divider"></div>
                        </>
                    )}

                    {/* Idle/Queued/Complete State - Show Summary */}
                    {!status?.isRunning && !status?.error && (
                        <div className="summary-section">
                            <div className="summary-row">
                                <span className="summary-label">Last Run:</span>
                                <span className="summary-value">
                                    {status?.lastCompletedRun ? (
                                        <>
                                            {formatTimestamp(status.lastCompletedRun)}
                                            <span className="relative-time"> ({getRelativeTime(status.lastCompletedRun)})</span>
                                        </>
                                    ) : 'Never'}
                                </span>
                            </div>
                            {status?.lastCompletedRun && status.totalOrders > 0 && (
                                <div className="summary-row">
                                    <span className="summary-label">Orders Indexed:</span>
                                    <span className="summary-value">{status.processedOrders}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Trigger Button */}
                    <button
                        onClick={() => setShowConfirm(true)}
                        disabled={isDisabled}
                        className="trigger-button-unified"
                    >
                        <RefreshCw size={18} className={status?.isRunning ? 'spinning' : ''} />
                        {isQueued ? 'Reindex Queued...' : status?.isRunning ? 'Reindexing...' : 'Trigger Full Reindex'}
                    </button>
                </div>

                {/* Order Editor Card */}
                <div ref={editorRef}>
                    <OrderEditorCard onOrderUpdate={handleOrderUpdate} />
                </div>
            </main>

            {/* Confirmation Dialog */}
            {showConfirm && (
                <div className="dialog-overlay" onClick={() => setShowConfirm(false)}>
                    <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
                        <h3>Confirm Reindex</h3>
                        <p>
                            Are you sure you want to trigger a full reindex? This will reprocess
                            all orders and may take some time.
                        </p>
                        <div className="dialog-actions">
                            <button onClick={() => setShowConfirm(false)} className="btn-cancel">
                                Cancel
                            </button>
                            <button onClick={handleTriggerReindex} className="btn-confirm">
                                Yes, Start Reindex
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
