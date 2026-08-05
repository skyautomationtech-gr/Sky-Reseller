import React, { useState, useEffect } from 'react';
import { 
  collection, query, where, getDocs, doc, runTransaction, serverTimestamp, getDoc, orderBy
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Order, OrderStatus, UserProfile } from '../../types';
import { CreateOrderModal } from './CreateOrderModal';
import { InvoiceModal } from './InvoiceModal';
import { 
  ShoppingBag, Search, Plus, Filter, Clock, CheckCircle2, Package, Truck, 
  XCircle, RotateCcw, AlertCircle, Loader2, Eye, MapPin, Phone, User, Store,
  ChevronRight, Calendar, FileText
} from 'lucide-react';

interface OrderListProps {
  user: UserProfile;
  onCreateOrderClick?: () => void;
}

const statusSteps: OrderStatus[] = [
  'pending',
  'accepted',
  'packing',
  'ready_to_ship',
  'shipped',
  'delivered',
];

const statusBadgeStyles: Record<OrderStatus, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pending', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  accepted: { label: 'Accepted', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: CheckCircle2 },
  packing: { label: 'Packing', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: Package },
  ready_to_ship: { label: 'Ready to Ship', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: Package },
  shipped: { label: 'Shipped', color: 'bg-cyan-50 text-cyan-700 border-cyan-200', icon: Truck },
  delivered: { label: 'Delivered', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: XCircle },
  returned: { label: 'Returned', color: 'bg-slate-100 text-slate-700 border-slate-300', icon: RotateCcw },
};

export const OrderList: React.FC<OrderListProps> = ({ user }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null);
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<Order | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const isAdminOrSuperAdmin = user.role === 'super_admin' || user.role === 'admin';

  useEffect(() => {
    fetchOrders();
  }, [user.uid, user.role]);

  const fetchOrders = async () => {
    setLoading(true);
    setActionError('');
    try {
      let q;
      if (isAdminOrSuperAdmin) {
        q = query(collection(db, 'orders'));
      } else {
        q = query(collection(db, 'orders'), where('resellerId', '==', user.uid));
      }

      const snap = await getDocs(q);
      const list: Order[] = [];
      snap.forEach((docSnap) => {
        list.push(Object.assign({ id: docSnap.id }, docSnap.data()) as unknown as Order);
      });

      // Sort in memory by createdAt desc
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setOrders(list);
    } catch (err: any) {
      console.error('Error fetching orders:', err);
      setActionError('Failed to load orders.');
    } finally {
      setLoading(false);
    }
  };

  // Status Change Logic with Firestore Transactions
  const handleUpdateOrderStatus = async (order: Order, newStatus: OrderStatus) => {
    if (order.status === newStatus) return;
    setUpdatingStatusId(order.id);
    setActionError('');

    try {
      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, 'orders', order.id);
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) {
          throw new Error('Order document does not exist.');
        }

        const currentOrderData = orderSnap.data() as Order;
        const prevStatus = currentOrderData.status;

        // Case 1: Transitioning TO "delivered" for the first time
        if (newStatus === 'delivered' && prevStatus !== 'delivered') {
          // A. Deduct stock from product / variant
          const productRef = doc(db, 'products', currentOrderData.productId);
          const productSnap = await transaction.get(productRef);

          if (productSnap.exists()) {
            const productData = productSnap.data();
            let newMainStock = productData.stock || 0;

            if (productData.hasVariants && productData.variants && currentOrderData.variantId) {
              const updatedVariants = productData.variants.map((v: any) => {
                if (v.id === currentOrderData.variantId) {
                  const currentVarStock = v.stock || 0;
                  return { ...v, stock: Math.max(0, currentVarStock - currentOrderData.quantity) };
                }
                return v;
              });
              // Recalculate main stock as sum of variants
              newMainStock = updatedVariants.reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
              transaction.update(productRef, {
                variants: updatedVariants,
                stock: newMainStock,
                updatedAt: serverTimestamp(),
              });
            } else {
              newMainStock = Math.max(0, newMainStock - currentOrderData.quantity);
              transaction.update(productRef, {
                stock: newMainStock,
                updatedAt: serverTimestamp(),
              });
            }
          }

          // B. Calculate Commission
          let calculatedCommission = currentOrderData.sellAmount; // Default: Sell Amount mode
          const settingsRef = doc(db, 'commissionSettings', 'global');
          const settingsSnap = await transaction.get(settingsRef);

          if (settingsSnap.exists()) {
            const settings = settingsSnap.data();
            // Check category overrides
            const catOverride = settings.categoryOverrides?.find(
              (c: any) => c.categoryId === currentOrderData.categoryId
            );

            const activeType = catOverride ? catOverride.commissionType : settings.defaultType || 'sell_amount';

            if (activeType === 'percentage') {
              const pct = catOverride ? catOverride.value : settings.percentageValue || 10;
              calculatedCommission = (currentOrderData.totalAmount * pct) / 100;
            } else if (activeType === 'fixed') {
              const fixedVal = catOverride ? catOverride.value : settings.fixedValue || 100;
              calculatedCommission = fixedVal * currentOrderData.quantity;
            }
          }

          // C. Create Commission Transaction
          const newTxRef = doc(collection(db, 'transactions'));
          transaction.set(newTxRef, {
            resellerId: currentOrderData.resellerId,
            resellerName: currentOrderData.resellerName,
            resellerShopName: currentOrderData.resellerShopName,
            type: 'commission',
            amount: calculatedCommission,
            status: 'approved',
            orderId: currentOrderData.id,
            orderNumber: currentOrderData.orderNumber,
            createdAt: serverTimestamp(),
          });

          // D. Update Reseller Wallet
          const walletRef = doc(db, 'wallets', currentOrderData.resellerId);
          const walletSnap = await transaction.get(walletRef);

          if (walletSnap.exists()) {
            const wData = walletSnap.data();
            transaction.update(walletRef, {
              balance: (wData.balance || 0) + calculatedCommission,
              totalEarned: (wData.totalEarned || 0) + calculatedCommission,
              updatedAt: serverTimestamp(),
            });
          } else {
            transaction.set(walletRef, {
              resellerId: currentOrderData.resellerId,
              balance: calculatedCommission,
              totalEarned: calculatedCommission,
              totalWithdrawn: 0,
              updatedAt: serverTimestamp(),
            });
          }
        }

        // Case 2: Transitioning TO "cancelled" or "returned" AFTER it was already "delivered"
        if ((newStatus === 'cancelled' || newStatus === 'returned') && prevStatus === 'delivered') {
          // Restore stock
          const productRef = doc(db, 'products', currentOrderData.productId);
          const productSnap = await transaction.get(productRef);

          if (productSnap.exists()) {
            const productData = productSnap.data();
            let newMainStock = productData.stock || 0;

            if (productData.hasVariants && productData.variants && currentOrderData.variantId) {
              const updatedVariants = productData.variants.map((v: any) => {
                if (v.id === currentOrderData.variantId) {
                  return { ...v, stock: (v.stock || 0) + currentOrderData.quantity };
                }
                return v;
              });
              newMainStock = updatedVariants.reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
              transaction.update(productRef, {
                variants: updatedVariants,
                stock: newMainStock,
                updatedAt: serverTimestamp(),
              });
            } else {
              newMainStock = newMainStock + currentOrderData.quantity;
              transaction.update(productRef, {
                stock: newMainStock,
                updatedAt: serverTimestamp(),
              });
            }
          }

          // Reverse / deduct commission from wallet
          const walletRef = doc(db, 'wallets', currentOrderData.resellerId);
          const walletSnap = await transaction.get(walletRef);
          if (walletSnap.exists()) {
            const wData = walletSnap.data();
            const revAmount = currentOrderData.sellAmount;
            transaction.update(walletRef, {
              balance: Math.max(0, (wData.balance || 0) - revAmount),
              totalEarned: Math.max(0, (wData.totalEarned || 0) - revAmount),
              updatedAt: serverTimestamp(),
            });
          }
        }

        // Update status on order doc
        transaction.update(orderRef, {
          status: newStatus,
          updatedAt: serverTimestamp(),
        });
      });

      fetchOrders();
    } catch (err: any) {
      console.error('Status update error:', err);
      setActionError(err.message || 'Failed to update order status.');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const matchesStatus =
      selectedStatusFilter === 'all' ? true : o.status === selectedStatusFilter;

    const matchesSearch =
      o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customerPhone.includes(searchTerm) ||
      o.productName.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {isAdminOrSuperAdmin ? 'All Reseller Orders' : 'My Orders'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAdminOrSuperAdmin
              ? 'Manage, process, and track order fulfillment across all reseller accounts'
              : 'Track order statuses, customer delivery progress, and expected commissions'}
          </p>
        </div>

        {!isAdminOrSuperAdmin && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-600/30 flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Order</span>
          </button>
        )}
      </div>

      {actionError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Filter Chips & Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Order #, Customer Name, Phone, or Product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
            />
          </div>

          <div className="text-xs text-slate-500 font-medium whitespace-nowrap">
            Showing <span className="font-bold text-slate-900">{filteredOrders.length}</span> of {orders.length} orders
          </div>
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-200">
          <button
            onClick={() => setSelectedStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
              selectedStatusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Orders ({orders.length})
          </button>

          {(
            [
              'pending',
              'accepted',
              'packing',
              'ready_to_ship',
              'shipped',
              'delivered',
              'cancelled',
              'returned',
            ] as OrderStatus[]
          ).map((st) => {
            const count = orders.filter((o) => o.status === st).length;
            const badge = statusBadgeStyles[st];
            const isSelected = selectedStatusFilter === st;
            return (
              <button
                key={st}
                onClick={() => setSelectedStatusFilter(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                  isSelected
                    ? `${badge.color} ring-2 ring-blue-500/30 font-bold shadow-xs`
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>{badge.label}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200/60 text-slate-700 font-bold">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span>Loading orders dataset...</span>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-900 mb-1">No Orders Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
              {searchTerm || selectedStatusFilter !== 'all'
                ? 'No orders match your active filter criteria.'
                : 'You have not created any orders yet. Click "Create New Order" to start selling.'}
            </p>
            {!isAdminOrSuperAdmin && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-xl"
              >
                Create Order Now
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="px-5 py-3.5">Order #</th>
                  {isAdminOrSuperAdmin && <th className="px-5 py-3.5">Reseller</th>}
                  <th className="px-5 py-3.5">Product & Variant</th>
                  <th className="px-5 py-3.5">Customer Info</th>
                  <th className="px-5 py-3.5 text-center">Qty</th>
                  <th className="px-5 py-3.5 text-right">Total Amount</th>
                  <th className="px-5 py-3.5 text-right">Profit / Commission</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredOrders.map((order) => {
                  const badge = statusBadgeStyles[order.status] || statusBadgeStyles.pending;
                  const BadgeIcon = badge.icon;
                  const isUpdating = updatingStatusId === order.id;

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Order # */}
                      <td className="px-5 py-4 font-bold text-blue-600 whitespace-nowrap">
                        <span className="bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                          {order.orderNumber}
                        </span>
                      </td>

                      {/* Reseller (Admin view) */}
                      {isAdminOrSuperAdmin && (
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-900 truncate max-w-[140px]">{order.resellerShopName}</p>
                          <p className="text-[10px] text-slate-500 truncate max-w-[140px]">{order.resellerName}</p>
                        </td>
                      )}

                      {/* Product & Variant */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {order.productImage ? (
                            <img
                              src={order.productImage}
                              alt={order.productName}
                              className="w-9 h-9 object-cover rounded-lg border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-[9px] font-bold shrink-0">
                              NO IMG
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-slate-900 line-clamp-1">{order.productName}</p>
                            {order.variantColorName && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                Color: {order.variantColorName}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Customer Info */}
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-900">{order.customerName}</p>
                        <p className="text-[11px] text-slate-500 font-mono">{order.customerPhone}</p>
                      </td>

                      {/* Qty */}
                      <td className="px-5 py-4 text-center font-bold text-slate-800">
                        {order.quantity}
                      </td>

                      {/* Total Amount */}
                      <td className="px-5 py-4 text-right">
                        <span className="font-bold text-slate-900">৳{order.totalAmount}</span>
                        <p className="text-[10px] text-slate-400 capitalize">Pay: {order.paymentStatus}</p>
                      </td>

                      {/* Sell Amount / Reseller Profit */}
                      <td className="px-5 py-4 text-right">
                        <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                          ৳{order.sellAmount}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <div className="space-y-1.5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.color}`}
                          >
                            <BadgeIcon className="w-3.5 h-3.5" />
                            <span>{badge.label}</span>
                          </span>

                          {/* Admin Status Dropdown */}
                          {isAdminOrSuperAdmin && (
                            <div className="pt-1">
                              <select
                                disabled={isUpdating}
                                value={order.status}
                                onChange={(e) =>
                                  handleUpdateOrderStatus(order, e.target.value as OrderStatus)
                                }
                                className="text-[10px] font-semibold bg-white border border-slate-300 text-slate-700 rounded-lg px-2 py-1 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
                              >
                                {statusSteps.map((st) => (
                                  <option key={st} value={st}>
                                    Move to {statusBadgeStyles[st].label}
                                  </option>
                                ))}
                                <option value="cancelled">Cancel Order</option>
                                <option value="returned">Return Order</option>
                              </select>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-center">
                        <button
                          onClick={() => setSelectedOrderForDetails(order)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View Order Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create Order */}
      <CreateOrderModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        user={user}
        onOrderCreated={() => fetchOrders()}
      />

      {/* Modal: View Details */}
      {selectedOrderForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <div>
                <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider block">
                  Order Details
                </span>
                <h3 className="text-base font-bold">{selectedOrderForDetails.orderNumber}</h3>
              </div>
              <button
                onClick={() => setSelectedOrderForDetails(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* Product Info */}
              <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                {selectedOrderForDetails.productImage && (
                  <img
                    src={selectedOrderForDetails.productImage}
                    alt={selectedOrderForDetails.productName}
                    className="w-16 h-16 object-cover rounded-xl border border-slate-200 shrink-0"
                  />
                )}
                <div className="flex-1">
                  <h4 className="font-bold text-slate-900 text-sm">{selectedOrderForDetails.productName}</h4>
                  {selectedOrderForDetails.variantColorName && (
                    <p className="text-xs text-amber-700 font-semibold mt-0.5">
                      Color Variant: {selectedOrderForDetails.variantColorName}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    Quantity: <span className="font-bold text-slate-800">{selectedOrderForDetails.quantity}</span> • Unit Selling Price: <span className="font-bold text-slate-800">৳{selectedOrderForDetails.sellingPrice !== undefined ? selectedOrderForDetails.sellingPrice : selectedOrderForDetails.unitRetailPrice}</span>
                    {selectedOrderForDetails.suggestedRetailPrice !== undefined && (
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Suggested Retail: ৳{selectedOrderForDetails.suggestedRetailPrice}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Customer Details */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Customer & Delivery Info</h4>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-900 font-bold">
                    <User className="w-4 h-4 text-blue-600" />
                    <span>{selectedOrderForDetails.customerName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <span>{selectedOrderForDetails.customerPhone}</span>
                  </div>
                  <div className="flex items-start gap-2 text-slate-700">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{selectedOrderForDetails.customerAddress}</span>
                  </div>
                </div>
              </div>

              {/* Pricing Breakdown */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Financial Breakdown</h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Total Amount Paid</span>
                    <span className="text-sm font-bold text-slate-900">৳{selectedOrderForDetails.totalAmount}</span>
                  </div>
                  <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                    <span className="text-[10px] text-emerald-700 font-bold block">Reseller Profit / Sell Amount</span>
                    <span className="text-sm font-bold text-emerald-700">৳{selectedOrderForDetails.sellAmount}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
              {(isAdminOrSuperAdmin || selectedOrderForDetails.resellerId === user.uid) && (
                <button
                  onClick={() => {
                    const orderToInv = selectedOrderForDetails;
                    setSelectedOrderForDetails(null);
                    setSelectedOrderForInvoice(orderToInv);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-sm transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span>{selectedOrderForDetails.invoiceNumber ? 'View Invoice' : 'Generate Invoice'}</span>
                </button>
              )}
              <button
                onClick={() => setSelectedOrderForDetails(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Invoice View/Generator */}
      <InvoiceModal
        isOpen={!!selectedOrderForInvoice}
        order={selectedOrderForInvoice}
        onClose={() => setSelectedOrderForInvoice(null)}
        onInvoiceGenerated={(updatedOrder) => {
          setOrders((prev) =>
            prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
          );
        }}
      />
    </div>
  );
};
