import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Product, Order, UserProfile } from '../../types';
import { ProductDetailModal } from '../inventory/ProductDetailModal';
import { InvoiceModal } from '../orders/InvoiceModal';
import { Search, Package, ShoppingBag, Users, Loader2, X, ChevronRight, FileText } from 'lucide-react';

interface GlobalSearchBarProps {
  user: UserProfile;
  onNavigateTab?: (tab: string) => void;
}

export const GlobalSearchBar: React.FC<GlobalSearchBarProps> = ({ user, onNavigateTab }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Search Results
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [orderResults, setOrderResults] = useState<Order[]>([]);
  const [resellerResults, setResellerResults] = useState<UserProfile[]>([]);

  // Selected Detail Modals
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchTerm.trim()) {
      setProductResults([]);
      setOrderResults([]);
      setResellerResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(() => {
      performSearch(searchTerm.trim().toLowerCase());
    }, 250);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const performSearch = async (queryStr: string) => {
    setLoading(true);
    setIsOpen(true);
    try {
      const [prodSnap, orderSnap, userSnap] = await Promise.all([
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'orders')),
        getDocs(collection(db, 'users')),
      ]);

      // 1. Products
      const matchedProducts: Product[] = [];
      prodSnap.forEach((d) => {
        const p = Object.assign({ id: d.id }, d.data()) as unknown as Product;
        if (
          p.name?.toLowerCase().includes(queryStr) ||
          p.sku?.toLowerCase().includes(queryStr) ||
          p.categoryName?.toLowerCase().includes(queryStr)
        ) {
          matchedProducts.push(p);
        }
      });

      // 2. Orders
      const matchedOrders: Order[] = [];
      orderSnap.forEach((d) => {
        const o = Object.assign({ id: d.id }, d.data()) as unknown as Order;
        if (
          o.orderNumber?.toLowerCase().includes(queryStr) ||
          o.customerPhone?.includes(queryStr) ||
          o.customerName?.toLowerCase().includes(queryStr) ||
          (o.invoiceNumber && o.invoiceNumber.toLowerCase().includes(queryStr))
        ) {
          matchedOrders.push(o);
        }
      });

      // 3. Resellers
      const matchedResellers: UserProfile[] = [];
      userSnap.forEach((d) => {
        const u = Object.assign({ uid: d.id }, d.data()) as unknown as UserProfile;
        if (
          u.role === 'reseller' &&
          (u.fullName?.toLowerCase().includes(queryStr) ||
            u.shopName?.toLowerCase().includes(queryStr) ||
            u.mobile?.includes(queryStr))
        ) {
          matchedResellers.push(u);
        }
      });

      setProductResults(matchedProducts.slice(0, 5));
      setOrderResults(matchedOrders.slice(0, 5));
      setResellerResults(matchedResellers.slice(0, 5));
    } catch (err) {
      console.error('Error executing global search:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProduct = (p: Product) => {
    setSelectedProduct(p);
    setIsOpen(false);
  };

  const handleSelectOrder = (o: Order) => {
    setSelectedOrder(o);
    setIsOpen(false);
  };

  const handleSelectReseller = (r: UserProfile) => {
    if (onNavigateTab) {
      onNavigateTab('resellers');
    }
    setIsOpen(false);
  };

  const hasResults = productResults.length > 0 || orderResults.length > 0 || resellerResults.length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
        <input
          type="text"
          placeholder="Global Search (Product, SKU, Order #, Phone, Invoice)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => {
            if (searchTerm.trim()) setIsOpen(true);
          }}
          className="w-full bg-slate-100 hover:bg-slate-200/80 focus:bg-white text-slate-900 text-xs font-medium rounded-xl pl-9 pr-8 py-2 border border-transparent focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
        />
        {searchTerm && (
          <button
            onClick={() => {
              setSearchTerm('');
              setIsOpen(false);
            }}
            className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-1 rounded-md"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 max-h-[80vh] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400 space-y-2 text-xs">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600 mr-2" />
              <span>Searching across database...</span>
            </div>
          ) : !hasResults ? (
            <div className="p-6 text-center text-slate-500 text-xs font-medium">
              No matching products, orders, or resellers found for "{searchTerm}".
            </div>
          ) : (
            <div className="p-3 space-y-4 text-xs divide-y divide-slate-100">
              {/* Products Group */}
              {productResults.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2">
                    <Package className="w-3.5 h-3.5 text-blue-600" />
                    <span>Products ({productResults.length})</span>
                  </div>
                  {productResults.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleSelectProduct(p)}
                      className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <div>
                        <p className="font-bold text-slate-900 line-clamp-1">{p.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">SKU: {p.sku} • ৳{p.retailPrice}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  ))}
                </div>
              )}

              {/* Orders Group */}
              {orderResults.length > 0 && (
                <div className="space-y-1.5 pt-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2">
                    <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Orders ({orderResults.length})</span>
                  </div>
                  {orderResults.map((o) => (
                    <div
                      key={o.id}
                      onClick={() => handleSelectOrder(o)}
                      className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 font-mono">{o.orderNumber}</span>
                          {o.invoiceNumber && (
                            <span className="bg-blue-50 text-blue-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-blue-200">
                              {o.invoiceNumber}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500">{o.customerName} • {o.customerPhone}</p>
                      </div>
                      <span className="font-bold text-slate-900">৳{o.totalAmount}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Resellers Group */}
              {resellerResults.length > 0 && (
                <div className="space-y-1.5 pt-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2">
                    <Users className="w-3.5 h-3.5 text-purple-600" />
                    <span>Resellers ({resellerResults.length})</span>
                  </div>
                  {resellerResults.map((r) => (
                    <div
                      key={r.uid}
                      onClick={() => handleSelectReseller(r)}
                      className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <div>
                        <p className="font-bold text-slate-900">{r.fullName}</p>
                        <p className="text-[10px] text-purple-600 font-medium">{r.shopName} • {r.mobile}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Product Detail Modal trigger from search result */}
      <ProductDetailModal
        isOpen={!!selectedProduct}
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />

      {/* Invoice Modal trigger from search result */}
      <InvoiceModal
        isOpen={!!selectedOrder}
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </div>
  );
};
