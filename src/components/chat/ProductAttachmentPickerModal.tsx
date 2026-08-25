import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Product } from '../../types';
import { X, Search, Package, Loader2 } from 'lucide-react';

interface ProductAttachmentPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (prod: { id: string; name: string; imageUrl?: string; resellerPrice: number }) => void;
}

export const ProductAttachmentPickerModal: React.FC<ProductAttachmentPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectProduct,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const fetchProducts = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(collection(db, 'products'), limit(50)));
        const list: Product[] = [];
        snap.forEach((d) => {
          const data = d.data() as Product;
          if (data.status !== 'deleted') {
            list.push({ id: d.id, ...data });
          }
        });
        setProducts(list);
      } catch (err) {
        console.error('Error fetching products for chat attachment:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredProducts = products.filter((p) => {
    const term = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      (p.sku && p.sku.toLowerCase().includes(term)) ||
      (p.categoryName && p.categoryName.toLowerCase().includes(term))
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-sm">Select Product to Share in Chat</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 bg-slate-50 border-b border-slate-200">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product by title, SKU, category..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="text-xs">Loading products...</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              No products found matching your search.
            </div>
          ) : (
            filteredProducts.map((prod) => {
              const coverImg = prod.images?.[0]?.url;
              return (
                <div
                  key={prod.id}
                  onClick={() => {
                    onSelectProduct({
                      id: prod.id,
                      name: prod.name,
                      imageUrl: coverImg,
                      resellerPrice: prod.resellerPrice,
                    });
                    onClose();
                  }}
                  className="p-2.5 bg-white hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                      {coverImg ? (
                        <img src={coverImg} alt={prod.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <Package className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 truncate">
                        {prod.name}
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        SKU: {prod.sku} • Stock: {prod.stock}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-extrabold text-xs text-blue-600 block">
                      ৳{prod.resellerPrice?.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-blue-500 font-bold group-hover:underline">
                      Attach →
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
