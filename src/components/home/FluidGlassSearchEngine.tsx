import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, X, Clock, Flame, ArrowRight, Sparkles, Package, 
  ExternalLink, ShoppingCart, Check, Tag, ChevronRight, Lock 
} from 'lucide-react';
import { Product } from '../../types';
import { triggerHaptic } from '../../lib/nativeFeedback';

interface FluidGlassSearchEngineProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  products: Product[];
  onSelectProduct?: (product: Product) => void;
  onAddToCart?: (product: Product) => void;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  canAccessFullApp?: boolean;
  onOpenLockedModal?: (featureName?: string) => void;
}

const PLACEHOLDER_HINTS = [
  'Search products, SKU or model...',
  'Search Smart Watches, Airpods...',
  'Search Fast Chargers, Cables...',
  'Search 100+ wholesale products...',
  'Type model number (e.g. T500, M10)...',
];

const TRENDING_TAGS = [
  'Smart Watch',
  'Earphones',
  'Charger',
  'Cable',
  'Power Bank',
  'Speaker',
];

const RECENT_SEARCHES_STORAGE_KEY = 'reseller_recent_searches';

const getProductImage = (p: Product): string => {
  if (!p.images || p.images.length === 0) return '';
  const first: any = p.images[0];
  if (typeof first === 'string') return first;
  return first?.url || '';
};

export const FluidGlassSearchEngine: React.FC<FluidGlassSearchEngineProps> = ({
  searchTerm,
  setSearchTerm,
  products,
  onSelectProduct,
  onAddToCart,
  selectedCategory,
  setSelectedCategory,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [addedItemIds, setAddedItemIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recent searches from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored).slice(0, 5));
      }
    } catch {
      // ignore
    }
  }, []);

  // Save new search query to recent searches
  const saveRecentSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return;
    try {
      setRecentSearches((prev) => {
        const updated = [trimmed, ...prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 5);
        localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    } catch {
      // ignore
    }
  };

  const removeRecentSearch = (itemToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setRecentSearches((prev) => {
        const updated = prev.filter((item) => item !== itemToRemove);
        localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    } catch {
      // ignore
    }
  };

  const clearAllRecent = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  // Rotating animated placeholder hints
  useEffect(() => {
    if (searchTerm || isFocused) return;
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_HINTS.length);
    }, 3200);
    return () => clearInterval(interval);
  }, [searchTerm, isFocused]);

  // Click outside listener to collapse dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Smart Search Engine Filtering with ranking
  const searchResults = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return [];

    const tokens = query.split(/\s+/).filter(Boolean);

    return products
      .filter((p) => {
        const name = (p.name || '').toLowerCase();
        const sku = (p.sku || '').toLowerCase();
        const category = (p.categoryName || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();

        // Must match all tokens
        return tokens.every(
          (t) => name.includes(t) || sku.includes(t) || category.includes(t) || desc.includes(t)
        );
      })
      .slice(0, 6);
  }, [searchTerm, products]);

  const totalMatchesCount = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return 0;
    const tokens = query.split(/\s+/).filter(Boolean);
    return products.filter((p) => {
      const name = (p.name || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const category = (p.categoryName || '').toLowerCase();
      return tokens.every((t) => name.includes(t) || sku.includes(t) || category.includes(t));
    }).length;
  }, [searchTerm, products]);

  const handleSelectKeyword = (keyword: string) => {
    triggerHaptic('light');
    setSearchTerm(keyword);
    saveRecentSearch(keyword);
    inputRef.current?.focus();
  };

  const handleClear = () => {
    triggerHaptic('light');
    setSearchTerm('');
    inputRef.current?.focus();
  };

  const handleQuickAddToCart = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    if (canAccessFullApp === false) {
      if (onOpenLockedModal) onOpenLockedModal('Ordering & Cart');
      return;
    }
    triggerHaptic('medium');
    if (onAddToCart) {
      onAddToCart(product);
      setAddedItemIds((prev) => new Set(prev).add(product.id));
      setTimeout(() => {
        setAddedItemIds((prev) => {
          const next = new Set(prev);
          next.delete(product.id);
          return next;
        });
      }, 1500);
    }
  };

  return (
    <div ref={containerRef} className="relative z-30 w-full select-none">
      {/* 1. Fluid Ambient Glow Backdrop (Active on focus or typing) */}
      <div 
        className={`absolute -inset-1 rounded-[24px] bg-gradient-to-r from-blue-500/25 via-teal-400/25 to-indigo-500/25 blur-lg transition-opacity duration-300 pointer-events-none will-change-transform ${
          isFocused ? 'opacity-100 scale-[1.01]' : 'opacity-0 scale-100'
        }`} 
      />

      {/* 2. Glassmorphism Search Bar Container */}
      <div
        className={`relative flex items-center w-full min-h-[48px] rounded-2xl border transition-all duration-300 overflow-hidden ${
          isFocused
            ? 'bg-white/95 border-blue-500/70 shadow-[0_10px_35px_-8px_rgba(37,99,235,0.22)] ring-2 ring-blue-500/20'
            : 'bg-white/80 hover:bg-white/90 border-white/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)]'
        } backdrop-blur-2xl`}
        style={{ WebkitBackdropFilter: 'blur(24px)' }}
      >
        {/* Shimmer Light Reflection Sweep Overlay */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
          <div className="absolute -inset-[100%] bg-gradient-to-tr from-transparent via-white/20 to-transparent pointer-events-none animate-shimmer-sweep opacity-60" />
        </div>

        {/* Search Engine Icon with Smooth Pulse */}
        <div className="pl-4 pr-2.5 flex items-center justify-center shrink-0">
          <motion.div
            animate={isFocused ? { scale: [1, 1.15, 1], rotate: [0, -10, 0] } : { scale: 1, rotate: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Search className={`w-4 h-4 transition-colors ${isFocused ? 'text-blue-600' : 'text-slate-400'}`} />
          </motion.div>
        </div>

        {/* Dynamic Animated Placeholder & Input Box */}
        <div className="relative flex-1 h-full min-w-0 flex items-center py-2.5">
          {/* Animated Sliding Placeholder when empty */}
          {!searchTerm && (
            <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none overflow-hidden pr-12 w-full">
              <AnimatePresence mode="wait">
                <motion.span
                  key={placeholderIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="text-xs sm:text-sm text-slate-400 font-medium truncate"
                >
                  {PLACEHOLDER_HINTS[placeholderIndex]}
                </motion.span>
              </AnimatePresence>
            </div>
          )}

          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onFocus={() => {
              triggerHaptic('light');
              setIsFocused(true);
            }}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                saveRecentSearch(searchTerm);
                setIsFocused(false);
              } else if (e.key === 'Escape') {
                setIsFocused(false);
              }
            }}
            className="w-full bg-transparent text-xs sm:text-sm text-slate-900 font-semibold outline-none border-none pr-3"
            autoComplete="off"
            spellCheck="false"
          />
        </div>

        {/* Right Action Icons (Clear Button, Results Badge, Live Indicator) */}
        <div className="pr-3 flex items-center gap-2 shrink-0">
          <AnimatePresence>
            {searchTerm ? (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                type="button"
                onClick={handleClear}
                className="w-6 h-6 rounded-full bg-slate-200/80 hover:bg-slate-300 active:bg-slate-400 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
                title="Clear Search"
              >
                <X className="w-3.5 h-3.5" />
              </motion.button>
            ) : (
              <span className="hidden sm:flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50/90 px-2 py-0.5 rounded-full border border-blue-200/60 pointer-events-none">
                <Sparkles className="w-2.5 h-2.5 text-blue-500" />
                Live Engine
              </span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 3. Search Engine Interactive Glassmorphism Overlay / Dropdown */}
      <AnimatePresence>
        {isFocused && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="absolute left-0 right-0 top-full mt-2 bg-white/95 backdrop-blur-2xl rounded-2xl border border-white/80 shadow-[0_16px_40px_rgba(0,0,0,0.12)] overflow-hidden z-50 text-slate-800"
            style={{ WebkitBackdropFilter: 'blur(24px)' }}
          >
            {/* If NO query typed: Show Trending Searches & Recent History */}
            {!searchTerm.trim() ? (
              <div className="p-3.5 sm:p-4 space-y-3.5">
                {/* Recent Searches */}
                {recentSearches.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-slate-400" /> Recent Searches
                      </span>
                      <button
                        onClick={clearAllRecent}
                        className="text-[10px] font-bold text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {recentSearches.map((item) => (
                        <div
                          key={item}
                          onClick={() => handleSelectKeyword(item)}
                          className="group inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100/90 hover:bg-blue-50 hover:border-blue-200 border border-slate-200/60 text-xs font-medium text-slate-700 hover:text-blue-600 transition-all cursor-pointer"
                        >
                          <span>{item}</span>
                          <button
                            onClick={(e) => removeRecentSearch(item, e)}
                            className="text-slate-400 hover:text-slate-700 ml-0.5 p-0.5"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Trending Hot Keywords */}
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <Flame className="w-3 h-3 text-amber-500" /> Trending Categories
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {TRENDING_TAGS.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => handleSelectKeyword(tag)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200/80 hover:border-blue-400/80 hover:bg-blue-50/70 text-xs font-semibold text-slate-700 hover:text-blue-600 transition-all cursor-pointer shadow-2xs"
                      >
                        <Tag className="w-3 h-3 text-blue-500" />
                        <span>{tag}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* If Query TYPED: Show Live Instant Results Preview */
              <div>
                {/* Header Summary */}
                <div className="px-4 py-2.5 bg-slate-50/90 border-b border-slate-200/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span className="font-semibold text-slate-600">
                      Matching: <strong className="text-slate-900">"{searchTerm}"</strong>
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-extrabold text-[10px]">
                    {totalMatchesCount} Found
                  </span>
                </div>

                {/* Results List */}
                {searchResults.length > 0 ? (
                  <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
                    {searchResults.map((p) => {
                      const isAdded = addedItemIds.has(p.id);
                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            triggerHaptic('light');
                            saveRecentSearch(searchTerm);
                            setIsFocused(false);
                            if (onSelectProduct) onSelectProduct(p);
                          }}
                          className="p-2.5 sm:p-3 hover:bg-blue-50/60 transition-colors flex items-center gap-3 cursor-pointer group"
                        >
                          {/* Product Thumbnail */}
                          <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200/70 overflow-hidden shrink-0 flex items-center justify-center">
                            {getProductImage(p) ? (
                              <img src={getProductImage(p)} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            ) : (
                              <Package className="w-5 h-5 text-slate-400" />
                            )}
                          </div>

                          {/* Info */}
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                              {p.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                              {p.sku && (
                                <span className="font-mono text-[10px] text-slate-400 font-medium">
                                  SKU: {p.sku}
                                </span>
                              )}
                              {canAccessFullApp !== false ? (
                                <>
                                  <span className="font-extrabold text-blue-700 tabular-nums">
                                    ৳{(p.resellerPrice || p.retailPrice || 0).toLocaleString()}
                                  </span>
                                  {p.stock !== undefined && (
                                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                      p.stock > 5 ? 'bg-emerald-50 text-emerald-700' : p.stock > 0 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                                    }`}>
                                      {p.stock > 5 ? 'In Stock' : p.stock > 0 ? `Low (${p.stock})` : 'Out of Stock'}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                  <Lock className="w-2.5 h-2.5 text-amber-600" />
                                  Price visible after approval
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action Button */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {onAddToCart && (
                              <button
                                type="button"
                                onClick={(e) => handleQuickAddToCart(e, p)}
                                className={`p-2 rounded-xl border transition-all cursor-pointer ${
                                  isAdded
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                    : 'bg-white hover:bg-blue-600 hover:text-white border-slate-200 text-slate-600 shadow-2xs'
                                }`}
                                title="Add to Cart"
                              >
                                {isAdded ? <Check className="w-3.5 h-3.5" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                              </button>
                            )}
                            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-400">
                    <p className="text-xs font-semibold text-slate-600">No products matched "{searchTerm}"</p>
                    <p className="text-[11px] text-slate-400 mt-1">Try searching by category, model number, or check spelling</p>
                  </div>
                )}

                {/* Footer Link to View All Results */}
                {totalMatchesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      saveRecentSearch(searchTerm);
                      setIsFocused(false);
                    }}
                    className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-inner"
                  >
                    <span>View all {totalMatchesCount} items on catalog</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
