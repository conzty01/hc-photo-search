import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import type { OrderMeta, SearchResult } from '../types';
import { Search, ExternalLink, Settings, FileEdit, X, UploadCloud } from 'lucide-react';
import { OrderOptions } from '../components/OrderOptions';


import { CopyButton } from '../components/CopyButton';

export const SearchPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const currentSearchTerm = searchParams.get('q') || '';

    // Initialize query from URL if present
    const [query, setQuery] = useState(currentSearchTerm);
    const [results, setResults] = useState<OrderMeta[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [needsReviewCount, setNeedsReviewCount] = useState(0);

    // Fetch Needs Review count on mount
    useEffect(() => {
        const fetchNeedsReviewCount = async () => {
            try {
                // Search for needsReview=true but limit to 0 results, just want count
                const response = await axios.get<SearchResult>('/search', {
                    params: { q: '', filter: 'needsReview=true', limit: 0 }
                });
                setNeedsReviewCount(response.data.estimatedTotalHits || 0);
            } catch (error) {
                console.error('Failed to fetch needs review count:', error);
            }
        };
        fetchNeedsReviewCount();
    }, []);

    // Sync local input state with URL when it changes (handle Back button)
    useEffect(() => {
        setQuery(currentSearchTerm);
    }, [currentSearchTerm]);

    // Perform search when URL param changes
    useEffect(() => {
        const performSearch = async () => {
            if (!currentSearchTerm.trim()) {
                setResults([]);
                setSearched(false);
                return;
            }

            setLoading(true);
            try {
                const response = await axios.get<SearchResult>('/search', {
                    params: { q: currentSearchTerm }
                });
                setResults(response.data.hits);
                setSearched(true);
            } catch (error) {
                console.error('Search failed:', error);
            } finally {
                setLoading(false);
            }
        };

        performSearch();
    }, [currentSearchTerm]);

    const handleSearch = (e: FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;
        setSearchParams({ q: query });
    };

    const handleClearSearch = () => {
        setQuery('');
        setSearchParams({});
        setResults([]);
        setSearched(false);
    };

    return (
        <div className="container">
            <header className="header">
                <div className="header-top">
                    <h1>Photo Search</h1>
                    <div className="header-actions">
                        <button onClick={() => navigate('/upload')} className="admin-button" title="Upload Photos">
                            <UploadCloud size={20} />
                        </button>
                        <button onClick={() => navigate('/admin')} className="admin-button" title="Admin Panel">
                            <Settings size={20} />
                            {needsReviewCount > 0 && (
                                <span className="badge-notification">{needsReviewCount}</span>
                            )}
                        </button>
                    </div>
                </div>
                <form onSubmit={handleSearch} className="search-form">
                    <div className="search-input-wrapper">
                        <Search className="search-icon" size={20} />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search orders (e.g., 'maple chest', '42 inch')..."
                            className="search-input"
                            style={{ paddingRight: query ? '40px' : '16px' }}
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={handleClearSearch}
                                className="clear-button"
                                title="Clear search"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                    <button type="submit" disabled={loading} className="search-button">
                        {loading ? 'Searching...' : 'Search'}
                    </button>
                </form>
            </header>

            <main className="results-grid">
                {searched && results.length === 0 && (
                    <div className="no-results">No orders found matching "{query}"</div>
                )}

                {results.map((order, index) => (
                    <div
                        key={order.orderNumber}
                        className="order-card"
                        style={{ animationDelay: `${index * 0.1}s` }}
                    >
                        <div className="card-header">
                            <span className="order-number">#{order.orderNumber}</span>
                            <div className="badges">
                                {order.isCustom && <span className="badge custom">Custom</span>}

                            </div>
                        </div>

                        <h3 className="product-name">{order.productName || 'Unknown Product'}</h3>

                        <OrderOptions options={order.options} />

                        <div className="actions">
                            {order.photoPath && (
                                <CopyButton
                                    text={order.photoPath}
                                    label="Path"
                                    title="Copy UNC Path"
                                />
                            )}

                            <button
                                onClick={() => navigate(`/admin?orderId=${order.orderNumber}`)}
                                className="action-btn link"
                                title="Edit Order"
                            >
                                <FileEdit size={16} /> Edit
                            </button>
                            {order.orderUrl && (
                                <a
                                    href={order.orderUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="action-btn link"
                                    title="View in Volusion"
                                >
                                    <ExternalLink size={16} /> Order
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </main>
        </div>
    );
};
