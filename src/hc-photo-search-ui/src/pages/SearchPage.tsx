import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import type { OrderMeta, SearchResult } from '../types';
import { Search, ExternalLink, Settings } from 'lucide-react';
import { OrderOptions } from '../components/OrderOptions';
import { CopyButton } from '../components/CopyButton';
import { ThemeToggle } from '../components/ThemeToggle';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8081';

export const SearchPage: React.FC = () => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<OrderMeta[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    const handleSearch = async (e: FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        try {
            const response = await axios.get<SearchResult>(`${API_URL}/search`, {
                params: { q: query }
            });
            setResults(response.data.hits);
            setSearched(true);
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            setLoading(false);
        }
    };



    return (
        <div className="container">
            <header className="header">
                <div className="header-top">
                    <h1>Photo Search</h1>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <button onClick={() => navigate('/admin')} className="admin-button" title="Admin Panel">
                            <Settings size={20} />
                        </button>
                        <ThemeToggle />
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
                        />
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
                            <CopyButton
                                text={order.photoPath}
                                label="Path"
                                title="Copy UNC Path"
                            />
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
