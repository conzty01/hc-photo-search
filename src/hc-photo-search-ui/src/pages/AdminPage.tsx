import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, RefreshCw, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { OrderEditorCard } from '../components/OrderEditorCard';
import { ThemeToggle } from '../components/ThemeToggle';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8081';

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

    const fetchStatus = async () => {
        try {
            const response = await axios.get<ReindexStatus>(`${API_URL}/admin/reindex/status`);
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
            await axios.post(`${API_URL}/admin/reindex`);
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h1>Admin Panel</h1>
                    <ThemeToggle />
                </div>
            </header>

            <main className="admin-content">
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
                <OrderEditorCard />
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
