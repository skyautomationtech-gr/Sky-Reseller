import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, Order } from '../../types';
import { X, Search, ShoppingBag, Loader2, Calendar, Check } from 'lucide-react';

interface OrderAttachmentPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onSelectOrder: (order: { id: string; orderNumber: string; status: string; totalAmount: number }) => void;
}

export const OrderAttachmentPickerModal: React.FC<OrderAttachmentPickerModalProps> = ({
  isOpen,
  onClose,
  user,
  onSelectOrder,
}) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const fetchOrders = async () => {
      setLoading(true);
      try {
        let q;
        if (user.role === 'reseller') {
          q = query(
            collection(db, 'orders'),
            where('resellerId', '==', user.uid),
            orderBy('createdAt', 'desc'),
            limit(30)
          );
        } else {
          q = query(
            collection(db, 'orders'),
            orderBy('createdAt', 'desc'),
            limit(30)
          );
        }
        const snap = await getDocs(q);
        const list: Order[] = [];
        snap.forEach((d) => {
          const data = d.data() as Order;
          list.push({ id: d.id, ...data });
        });
        setOrders(list);
      } catch (err) {
        console.error('Error fetching orders for chat attachment:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [isOpen, user.uid, user.role]);

  if (!isOpen) return null;

  const filteredOrders = orders.filter((o) => {
    const term = search.toLowerCase();
    return (
      (o.orderNumber && o.orderNumber.toLowerCase().includes(term)) ||
      (o.customerName && o.customerName.toLowerCase().includes(term)) ||
      (o.customerPhone && o.customerPhone.includes(term))
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-md">DELIVERED</span>;
      case 'pending':
        return <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-md">PENDING</span>;
      case 'processing':
        return <span className="bg-blue-100 text-blue-800 text-[10px] font-extrabold px-2 py-0.5 rounded-md">PROCESSING</span>;
      case 'cancelled':
        return <span className="bg-rose-100 text-rose-800 text-[10px] font-extrabold px-2 py-0.5 rounded-md">CANCELLED</span>;
      default:
        return <span className="bg-slate-100 text-slate-800 text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase">{status}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-sm">Select Order to Share</h3>
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
              placeholder="Search by Order #, Customer Name, Phone..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Orders List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="text-xs">Loading recent orders...</span>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              No orders found matching your search.
            </div>
          ) : (
            filteredOrders.map((ord) => (
              <div
                key={ord.id}
                onClick={() => {
                  onSelectOrder({
                    id: ord.id,
                    orderNumber: ord.orderNumber || ord.id.slice(0, 8),
                    status: ord.status,
                    totalAmount: ord.totalAmount || 0,
                  });
                  onClose();
                }}
                className="p-3 bg-white hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 group"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-xs text-slate-900 group-hover:text-blue-600">
                      Order #{ord.orderNumber || ord.id.slice(0, 8)}
                    </span>
                    {getStatusBadge(ord.status)}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Customer: <span className="font-semibold text-slate-700">{ord.customerName}</span> ({ord.customerPhone})
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-extrabold text-sm text-slate-900 block">
                    ৳{ord.totalAmount?.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-blue-600 font-bold group-hover:underline">
                    Attach →
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
