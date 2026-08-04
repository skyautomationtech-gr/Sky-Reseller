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
    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center font-bold">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-rose-900">Low Stock Alert ({lowStockProducts.length})</h3>
            <p className="text-xs text-rose-600">The following products have reached or fallen below their low stock threshold.</p>
          </div>
        </div>
        <button
          onClick={onNavigateToProducts}
          className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm flex items-center gap-2"
        >
          <span>Manage Inventory</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {lowStockProducts.slice(0, 6).map((p) => (
          <div key={p.id} className="bg-white p-3.5 rounded-xl border border-rose-100 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-3 overflow-hidden">
              {p.images && p.images[0] ? (
                <img src={p.images[0]} alt={p.name} className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <Package className="w-4 h-4" />
                </div>
              )}
              <div className="overflow-hidden">
                <p className="font-bold text-slate-900 text-xs truncate">{p.name}</p>
                <p className="text-[10px] text-slate-500 font-mono">SKU: {p.sku}</p>
              </div>
            </div>
            <span className="bg-rose-100 text-rose-700 font-mono font-bold text-xs px-2.5 py-1 rounded-lg shrink-0">
              {p.stock} left
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
