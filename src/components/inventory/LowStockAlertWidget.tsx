import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Product } from '../../types';
import { AlertTriangle, Package, ArrowRight } from 'lucide-react';

interface LowStockAlertWidgetProps {
  onNavigateToProducts: () => void;
}

export const LowStockAlertWidget: React.FC<LowStockAlertWidgetProps> = ({ onNavigateToProducts }) => {
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLowStock = async () => {
      try {
        const prodSnap = await getDocs(collection(db, 'products'));
        const prods: Product[] = prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
        const filtered = prods.filter(p => p.status !== 'deleted' && p.stock <= (p.lowStockThreshold || 5));
        setLowStockProducts(filtered);
      } catch (err) {
        console.error('Error fetching low stock:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLowStock();
  }, []);

  if (loading || lowStockProducts.length === 0) {
    return null;
  }

  return (
    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center font-bold shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-rose-900">Low Stock Alert ({lowStockProducts.length})</h3>
            <p className="text-xs text-rose-600">Products at or below low stock threshold.</p>
          </div>
        </div>
        <button
          onClick={onNavigateToProducts}
          className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-3 sm:py-2 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 min-h-[44px] sm:min-h-[38px] cursor-pointer active:scale-98"
        >
          <span>Manage Inventory</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Internal Scrollable Container for Low Stock Products */}
      <div className="max-h-60 overflow-y-auto pr-1 space-y-2 scrollbar-thin scrollbar-thumb-rose-200">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {lowStockProducts.map((p) => (
            <div key={p.id} className="bg-white p-3 rounded-xl border border-rose-100 flex items-center justify-between shadow-2xs hover:border-rose-300 transition-colors">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                {p.images && p.images[0] ? (
                  <img src={typeof p.images[0] === 'string' ? p.images[0] : (p.images[0] as any).url} alt={p.name} className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 text-xs truncate">{p.name}</p>
                  <p className="text-[10px] text-slate-500 font-mono">SKU: {p.sku}</p>
                </div>
              </div>
              <span className="bg-rose-100 text-rose-700 font-mono font-extrabold text-xs px-2.5 py-1 rounded-lg shrink-0">
                {p.stock} left
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
