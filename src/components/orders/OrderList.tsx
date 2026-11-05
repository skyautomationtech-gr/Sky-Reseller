import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, query, where, getDocs, doc, runTransaction, serverTimestamp, getDoc, updateDoc
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Order, OrderStatus, OrderPaymentStatus, UserProfile, Product } from '../../types';
import { formatResellerId } from '../../lib/resellerIdHelper';
import { CreateOrderModal } from './CreateOrderModal';
import { OrderCustomizationForm } from './OrderCustomizationForm';
import { InvoiceModal } from './InvoiceModal';
import { ProductReviewForm } from '../reviews/ProductReviewForm';
import { 
  ShoppingBag, Search, Plus, SlidersHorizontal, Clock, CheckCircle2, Package, Truck, 
  XCircle, RotateCcw, AlertCircle, Loader2, Eye, MapPin, Phone, User, Store,
  ChevronRight, Calendar, FileText, Star, ClipboardEdit, Gift, Copy, Check,
  MessageCircle, ExternalLink, ArrowUpDown, ChevronDown, RefreshCw, X, ShieldAlert,
  ArrowUpRight
} from 'lucide-react';
import { usePageRefresh, useRefresh } from '../../context/RefreshContext';
import { createAppNotification } from '../../lib/notificationHelper';
import { triggerHaptic } from '../../lib/nativeFeedback';

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

const statusMeta: Record<OrderStatus, { label: string; accentColor: string; edgeColor: string; textColor: string; bgColor: string }> = {
  pending: {
    label: 'Pending',
    accentColor: '#D97706',
    edgeColor: 'bg-amber-500',
    textColor: 'text-amber-800',
    bgColor: 'bg-amber-50 border-amber-200',
  },
  accepted: {
    label: 'Accepted',
    accentColor: '#0E9AA7',
    edgeColor: 'bg-[#0E9AA7]',
    textColor: 'text-[#0E9AA7]',
    bgColor: 'bg-teal-50 border-teal-200',
  },
  packing: {
    label: 'Packing',
    accentColor: '#2563EB',
    edgeColor: 'bg-blue-600',
    textColor: 'text-blue-700',
    bgColor: 'bg-blue-50 border-blue-200',
  },
  ready_to_ship: {
    label: 'Ready to Ship',
    accentColor: '#4F46E5',
    edgeColor: 'bg-indigo-600',
    textColor: 'text-indigo-700',
    bgColor: 'bg-indigo-50 border-indigo-200',
  },
  shipped: {
    label: 'Shipped',
    accentColor: '#0891B2',
    edgeColor: 'bg-cyan-600',
    textColor: 'text-cyan-800',
    bgColor: 'bg-cyan-50 border-cyan-200',
  },
  delivered: {
    label: 'Delivered',
    accentColor: '#16A34A',
    edgeColor: 'bg-[#3DD055]',
    textColor: 'text-emerald-800',
    bgColor: 'bg-emerald-50 border-emerald-200',
  },
  cancelled: {
    label: 'Cancelled',
    accentColor: '#E11D48',
    edgeColor: 'bg-rose-600',
    textColor: 'text-rose-800',
    bgColor: 'bg-rose-50 border-rose-200',
  },
  returned: {
    label: 'Returned',
    accentColor: '#64748B',
    edgeColor: 'bg-slate-500',
    textColor: 'text-slate-800',
    bgColor: 'bg-slate-100 border-slate-300',
  },
};

const formatOrderDateTime = (dateVal: any) => {
  if (!dateVal) return '';
  let d: Date;
  if (dateVal.toDate) {
    d = dateVal.toDate();
  } else if (dateVal.seconds) {
    d = new Date(dateVal.seconds * 1000);
  } else {
    d = new Date(dateVal);
  }
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' +
         d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
};

export const OrderList: React.FC<OrderListProps> = ({ user }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');

  // Modals & Sheets
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCustomOrderModalOpen, setIsCustomOrderModalOpen] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null);
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<Order | null>(null);
  const [selectedReviewProductId, setSelectedReviewProductId] = useState<string | null>(null);
  const [reorderProduct, setReorderProduct] = useState<Product | null>(null);

  // Status updates & actions
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [copiedAddressId, setCopiedAddressId] = useState<string | null>(null);
  const [copiedTrackingId, setCopiedTrackingId] = useState<string | null>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatusTab, setSelectedStatusTab] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'unpaid' | 'partial'>('all');
  const [sortOption, setSortOption] = useState<'newest' | 'oldest' | 'amount_high' | 'amount_low' | 'profit_high'>('newest');
  const [quickSummaryFilter, setQuickSummaryFilter] = useState<'all' | 'active' | 'delivered_month' | 'expected_commission'>('all');

  // Pagination
  const [visibleCount, setVisibleCount] = useState<number>(20);

  const isAdminOrSuperAdmin = user.role === 'super_admin' || user.role === 'admin';
  const { showToast } = useRefresh();

  // Load orders on mount or user change
  useEffect(() => {
    fetchOrders();
  }, [user.uid, user.role]);

  // Hook for pull-to-refresh or global refresh
  usePageRefresh('orders', async () => {
    await fetchOrders(true);
  });

  const fetchOrders = async (isManualRefresh = false) => {
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

      // Sort by createdAt descending
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setOrders(list);
      if (isManualRefresh) {
        showToast('✓ Orders up to date', 'success');
      }
    } catch (err: any) {
      console.error('Error fetching orders:', err);
      setActionError('Failed to load orders.');
      if (isManualRefresh) {
        showToast('✗ Failed to refresh orders', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Helper for copying with visual feedback
  const handleCopyText = (text: string, type: 'order' | 'address' | 'tracking', id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    triggerHaptic('light');
    showToast('Copied to clipboard', 'info');
    if (type === 'order') {
      setCopiedOrderId(id);
      setTimeout(() => setCopiedOrderId(null), 1800);
    } else if (type === 'address') {
      setCopiedAddressId(id);
      setTimeout(() => setCopiedAddressId(null), 1800);
    } else if (type === 'tracking') {
      setCopiedTrackingId(id);
      setTimeout(() => setCopiedTrackingId(null), 1800);
    }
  };

  // Status Change Logic with Firestore Transactions (Preserved 100%)
  const handleUpdateOrderStatus = async (order: Order, newStatus: OrderStatus) => {
    if (order.status === newStatus) return;
    setUpdatingStatusId(order.id);
    setActionError('');

    let currentOrderData: any = null;
    let calculatedCommission = 0;

    try {
      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, 'orders', order.id);
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) {
          throw new Error('Order document does not exist.');
        }

        currentOrderData = {
          ...orderSnap.data(),
          id: orderSnap.id,
        } as Order;
        const prevStatus = currentOrderData.status;

        // Case 1: Transitioning TO "delivered" for the first time
        if (newStatus === 'delivered' && prevStatus !== 'delivered') {
          const productRef = doc(db, 'products', currentOrderData.productId);
          const settingsRef = doc(db, 'commissionSettings', 'global');
          const walletRef = doc(db, 'wallets', currentOrderData.resellerId);

          const [productSnap, settingsSnap, walletSnap] = await Promise.all([
            transaction.get(productRef),
            transaction.get(settingsRef),
            transaction.get(walletRef),
          ]);

          let productUpdatePayload: any = null;
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
              newMainStock = updatedVariants.reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
              productUpdatePayload = {
                variants: updatedVariants,
                stock: newMainStock,
                updatedAt: serverTimestamp(),
              };
            } else {
              newMainStock = Math.max(0, newMainStock - currentOrderData.quantity);
              productUpdatePayload = {
                stock: newMainStock,
                updatedAt: serverTimestamp(),
              };
            }
          }

          calculatedCommission = currentOrderData.sellAmount || 0;
          if (settingsSnap.exists()) {
            const settings = settingsSnap.data();
            const catOverride = settings.categoryOverrides?.find(
              (c: any) => c.categoryId === currentOrderData.categoryId
            );

            const activeType = catOverride ? catOverride.commissionType : settings.defaultType || 'sell_amount';

            if (activeType === 'percentage') {
              const pct = catOverride ? catOverride.value : settings.percentageValue || 10;
              calculatedCommission = ((currentOrderData.totalAmount || 0) * pct) / 100;
            } else if (activeType === 'fixed') {
              const fixedVal = catOverride ? catOverride.value : settings.fixedValue || 100;
              calculatedCommission = fixedVal * (currentOrderData.quantity || 1);
            }
          }

          if (productUpdatePayload) {
            transaction.update(productRef, productUpdatePayload);
          }

          const resolvedOrderId = String(currentOrderData.id || orderSnap.id || order.id || '').trim();
          const resolvedResellerId = String(currentOrderData.resellerId || order.resellerId || '').trim();
          const resolvedOrderNumber = String(currentOrderData.orderNumber || order.orderNumber || 'ORD-UNKNOWN').trim();
          const resolvedResellerName = String(currentOrderData.resellerName || order.resellerName || 'Reseller').trim();
          const resolvedResellerShopName = String(currentOrderData.resellerShopName || order.resellerShopName || 'Shop').trim();
          const resolvedAmount = Number(calculatedCommission) || 0;

          if (!resolvedOrderId || !resolvedResellerId) {
            throw new Error('Transaction aborted: orderId or resellerId missing.');
          }

          const newTxRef = doc(collection(db, 'transactions'));
          transaction.set(newTxRef, {
            resellerId: resolvedResellerId,
            resellerName: resolvedResellerName,
            resellerShopName: resolvedResellerShopName,
            type: 'commission',
            amount: resolvedAmount,
            status: 'approved',
            orderId: resolvedOrderId,
            orderNumber: resolvedOrderNumber,
            createdAt: serverTimestamp(),
          });

          if (walletSnap.exists()) {
            const wData = walletSnap.data();
            transaction.update(walletRef, {
              balance: (wData.balance || 0) + resolvedAmount,
              totalEarned: (wData.totalEarned || 0) + resolvedAmount,
              updatedAt: serverTimestamp(),
            });
          } else {
            transaction.set(walletRef, {
              resellerId: resolvedResellerId,
              balance: resolvedAmount,
              totalEarned: resolvedAmount,
              totalWithdrawn: 0,
              updatedAt: serverTimestamp(),
            });
          }
        }

        // Case 2: Transitioning TO "cancelled" or "returned" AFTER it was already "delivered"
        if ((newStatus === 'cancelled' || newStatus === 'returned') && prevStatus === 'delivered') {
          const productRef = doc(db, 'products', currentOrderData.productId);
          const walletRef = doc(db, 'wallets', currentOrderData.resellerId);

          const [productSnap, walletSnap] = await Promise.all([
            transaction.get(productRef),
            transaction.get(walletRef),
          ]);

          let productUpdatePayload: any = null;
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
              productUpdatePayload = {
                variants: updatedVariants,
                stock: newMainStock,
                updatedAt: serverTimestamp(),
              };
            } else {
              newMainStock = newMainStock + currentOrderData.quantity;
              productUpdatePayload = {
                stock: newMainStock,
                updatedAt: serverTimestamp(),
              };
            }
          }

          if (productUpdatePayload) {
            transaction.update(productRef, productUpdatePayload);
          }

          if (walletSnap.exists()) {
            const wData = walletSnap.data();
            const revAmount = currentOrderData.sellAmount || 0;
            transaction.update(walletRef, {
              balance: Math.max(0, (wData.balance || 0) - revAmount),
              totalEarned: Math.max(0, (wData.totalEarned || 0) - revAmount),
              updatedAt: serverTimestamp(),
            });
          }
        }

        transaction.update(orderRef, {
          status: newStatus,
          updatedAt: serverTimestamp(),
        });
      });

      // Notification
      try {
        const orderNum = currentOrderData.orderNumber || 'ORD-UNKNOWN';
        const prodName = currentOrderData.productName || 'product';
        const formattedStatus = newStatus.replace(/_/g, ' ').toUpperCase();

        if (newStatus === 'delivered') {
          await createAppNotification({
            title: `Order #${orderNum} Delivered! ৳${calculatedCommission} Earned`,
            message: `Your order for "${prodName}" was delivered successfully. ৳${calculatedCommission} commission credited to your wallet.`,
            type: 'commission',
            targetAudience: 'reseller',
            targetResellerId: currentOrderData.resellerId,
            metadata: {
              orderId: order.id,
              orderNumber: orderNum,
              type: 'commission',
              amount: calculatedCommission,
            },
            priority: 'high',
          });
        } else {
          await createAppNotification({
            title: `Order #${orderNum}: ${formattedStatus}`,
            message: `Status of order #${orderNum} (${prodName}) has been updated to "${formattedStatus}".`,
            type: 'order_status',
            targetAudience: 'reseller',
            targetResellerId: currentOrderData.resellerId,
            metadata: {
              orderId: order.id,
              orderNumber: orderNum,
              type: 'order_status',
              status: newStatus,
            },
            priority: 'normal',
          });
        }
      } catch (notifErr) {
        console.error('Failed to dispatch status notification:', notifErr);
      }

      fetchOrders();
    } catch (err: any) {
      console.error('Status update error:', err);
      setActionError(err.message || 'Failed to update order status.');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  // Direct Cancel for Pending Orders (Reseller Self-Service)
  const handleCancelPendingOrder = async (orderToCancel: Order) => {
    if (orderToCancel.status !== 'pending') return;
    setCancellingOrderId(orderToCancel.id);
    try {
      const orderRef = doc(db, 'orders', orderToCancel.id);
      await updateDoc(orderRef, {
        status: 'cancelled',
        cancelledBy: user.uid,
        cancellationReason: 'Cancelled by reseller',
        updatedAt: serverTimestamp(),
      });
      triggerHaptic('medium');
      showToast('✓ Order cancelled successfully', 'info');
      setSelectedOrderForDetails(null);
      fetchOrders();
    } catch (err: any) {
      console.error('Cancel order error:', err);
      showToast(err.message || 'Failed to cancel order', 'error');
    } finally {
      setCancellingOrderId(null);
    }
  };

  // Reorder Handler: loads product and opens CreateOrderModal
  const handleReorder = async (order: Order) => {
    try {
      triggerHaptic('light');
      const prodRef = doc(db, 'products', order.productId);
      const prodSnap = await getDoc(prodRef);
      if (prodSnap.exists()) {
        const prodData = { id: prodSnap.id, ...prodSnap.data() } as Product;
        setReorderProduct(prodData);
      } else {
        setReorderProduct(null);
      }
      setSelectedOrderForDetails(null);
      setIsCreateModalOpen(true);
    } catch (err) {
      console.error('Error preparing reorder:', err);
      setSelectedOrderForDetails(null);
      setIsCreateModalOpen(true);
    }
  };

  // Contact Support handler: copies order number & routes to support tab
  const handleContactSupport = (order: Order) => {
    navigator.clipboard.writeText(`Order #${order.orderNumber}`);
    triggerHaptic('light');
    showToast(`Order #${order.orderNumber} copied. Opening support...`, 'info');
    setSelectedOrderForDetails(null);
    window.dispatchEvent(new CustomEvent('sky_navigate_tab', { 
      detail: { tab: 'support', orderNumber: order.orderNumber } 
    }));
  };

  // Compute Summary Metrics
  const summaryMetrics = useMemo(() => {
    const activeStatuses: OrderStatus[] = ['pending', 'accepted', 'packing', 'ready_to_ship', 'shipped'];
    let activeCount = 0;
    let deliveredMonthCount = 0;
    let expectedCommission = 0;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    orders.forEach((o) => {
      // Active count
      if (activeStatuses.includes(o.status)) {
        activeCount++;
        expectedCommission += Number(o.sellAmount || 0);
      }

      // Delivered this month
      if (o.status === 'delivered') {
        let orderDate: Date | null = null;
        if (o.createdAt) {
          if (o.createdAt.toDate) orderDate = o.createdAt.toDate();
          else if (o.createdAt.seconds) orderDate = new Date(o.createdAt.seconds * 1000);
          else orderDate = new Date(o.createdAt);
        }
        if (orderDate && orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear) {
          deliveredMonthCount++;
        }
      }
    });

    return { activeCount, deliveredMonthCount, expectedCommission };
  }, [orders]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length };
    orders.forEach((o) => {
      counts[o.status] = (counts[o.status] || 0) + 1;
    });
    return counts;
  }, [orders]);

  // Filtered and Sorted Orders
  const filteredAndSortedOrders = useMemo(() => {
    return orders.filter((o) => {
      // 1. Search filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const numMatch = o.orderNumber?.toLowerCase().includes(term);
        const nameMatch = o.customerName?.toLowerCase().includes(term);
        const phoneMatch = o.customerPhone?.includes(term);
        const prodMatch = o.productName?.toLowerCase().includes(term);
        if (!numMatch && !nameMatch && !phoneMatch && !prodMatch) {
          return false;
        }
      }

      // 2. Status Tab Filter
      if (selectedStatusTab !== 'all') {
        if (o.status !== selectedStatusTab) return false;
      }

      // 3. Quick Summary Tile Filter
      if (quickSummaryFilter === 'active') {
        const activeStatuses: OrderStatus[] = ['pending', 'accepted', 'packing', 'ready_to_ship', 'shipped'];
        if (!activeStatuses.includes(o.status)) return false;
      } else if (quickSummaryFilter === 'delivered_month') {
        if (o.status !== 'delivered') return false;
        let d: Date | null = null;
        if (o.createdAt) {
          if (o.createdAt.toDate) d = o.createdAt.toDate();
          else if (o.createdAt.seconds) d = new Date(o.createdAt.seconds * 1000);
          else d = new Date(o.createdAt);
        }
        const now = new Date();
        if (!d || d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) {
          return false;
        }
      } else if (quickSummaryFilter === 'expected_commission') {
        const activeStatuses: OrderStatus[] = ['pending', 'accepted', 'packing', 'ready_to_ship', 'shipped'];
        if (!activeStatuses.includes(o.status) || !o.sellAmount) return false;
      }

      // 4. Payment status filter
      if (paymentFilter !== 'all') {
        if (o.paymentStatus !== paymentFilter) return false;
      }

      // 5. Date filter
      if (dateFilter !== 'all') {
        let orderDate: Date | null = null;
        if (o.createdAt) {
          if (o.createdAt.toDate) orderDate = o.createdAt.toDate();
          else if (o.createdAt.seconds) orderDate = new Date(o.createdAt.seconds * 1000);
          else orderDate = new Date(o.createdAt);
        }
        if (!orderDate) return false;

        const now = new Date();
        if (dateFilter === 'today') {
          const isToday = orderDate.getDate() === now.getDate() &&
                          orderDate.getMonth() === now.getMonth() &&
                          orderDate.getFullYear() === now.getFullYear();
          if (!isToday) return false;
        } else if (dateFilter === 'week') {
          const diffDays = (now.getTime() - orderDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 7) return false;
        } else if (dateFilter === 'month') {
          if (orderDate.getMonth() !== now.getMonth() || orderDate.getFullYear() !== now.getFullYear()) {
            return false;
          }
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortOption === 'oldest') {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return timeA - timeB;
      }
      if (sortOption === 'amount_high') {
        return (b.totalAmount || 0) - (a.totalAmount || 0);
      }
      if (sortOption === 'amount_low') {
        return (a.totalAmount || 0) - (b.totalAmount || 0);
      }
      if (sortOption === 'profit_high') {
        return (b.sellAmount || 0) - (a.sellAmount || 0);
      }
      // default: newest
      const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
      const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }, [orders, searchTerm, selectedStatusTab, quickSummaryFilter, paymentFilter, dateFilter, sortOption]);

  const activeFiltersCount = (dateFilter !== 'all' ? 1 : 0) +
                             (paymentFilter !== 'all' ? 1 : 0) +
                             (sortOption !== 'newest' ? 1 : 0) +
                             (quickSummaryFilter !== 'all' ? 1 : 0);

  const clearAllFilters = () => {
    triggerHaptic('light');
    setSearchTerm('');
    setSelectedStatusTab('all');
    setDateFilter('all');
    setPaymentFilter('all');
    setSortOption('newest');
    setQuickSummaryFilter('all');
    setVisibleCount(20);
  };

  return (
    <div className="space-y-4 pb-24 selection:bg-[#0E9AA7]/20">
      
      {/* 1. Header (Title + 1-Line Subtitle - NO button row under title) */}
      <div className="px-1 pt-1">
        <h2 className="text-[20px] font-bold text-[#04203F] tracking-tight">
          {isAdminOrSuperAdmin ? 'Reseller Orders' : 'My Orders'}
        </h2>
        <p className="text-[12px] text-slate-500 mt-0.5 font-medium">
          {isAdminOrSuperAdmin 
            ? 'Manage and fulfill order deliveries across all reseller accounts' 
            : 'Track order delivery journey, customer details, and your earnings'}
        </p>
      </div>

      {actionError && (
        <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* 2. Summary Strip (Horizontal 3 compact stat tiles - click to filter) */}
      <div className="grid grid-cols-3 gap-2.5">
        {/* Active Orders Tile */}
        <div
          onClick={() => {
            triggerHaptic('light');
            setQuickSummaryFilter(quickSummaryFilter === 'active' ? 'all' : 'active');
            setSelectedStatusTab('all');
          }}
          className={`cursor-pointer rounded-2xl p-3 border transition-all select-none ${
            quickSummaryFilter === 'active'
              ? 'bg-blue-50/90 border-blue-400 shadow-sm ring-1 ring-blue-400'
              : 'bg-white/80 backdrop-blur-xl border-white/80 hover:bg-white shadow-[0_2px_12px_rgba(4,32,63,0.03)]'
          }`}
        >
          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
            <span>Active Orders</span>
            <Package className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-[18px] font-extrabold text-[#04203F] mt-1 tabular-nums">
            {summaryMetrics.activeCount}
          </div>
          <div className="text-[10px] text-blue-700 font-semibold mt-0.5">
            In fulfillment
          </div>
        </div>

        {/* Delivered This Month Tile */}
        <div
          onClick={() => {
            triggerHaptic('light');
            setQuickSummaryFilter(quickSummaryFilter === 'delivered_month' ? 'all' : 'delivered_month');
            setSelectedStatusTab('delivered');
          }}
          className={`cursor-pointer rounded-2xl p-3 border transition-all select-none ${
            quickSummaryFilter === 'delivered_month'
              ? 'bg-emerald-50/90 border-emerald-400 shadow-sm ring-1 ring-emerald-400'
              : 'bg-white/80 backdrop-blur-xl border-white/80 hover:bg-white shadow-[0_2px_12px_rgba(4,32,63,0.03)]'
          }`}
        >
          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
            <span>Delivered</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-[#3DD055]" />
          </div>
          <div className="text-[18px] font-extrabold text-[#04203F] mt-1 tabular-nums">
            {summaryMetrics.deliveredMonthCount}
          </div>
          <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
            This month
          </div>
        </div>

        {/* Expected Commission Tile */}
        <div
          onClick={() => {
            triggerHaptic('light');
            setQuickSummaryFilter(quickSummaryFilter === 'expected_commission' ? 'all' : 'expected_commission');
            setSelectedStatusTab('all');
          }}
          className={`cursor-pointer rounded-2xl p-3 border transition-all select-none ${
            quickSummaryFilter === 'expected_commission'
              ? 'bg-teal-50/90 border-teal-400 shadow-sm ring-1 ring-teal-400'
              : 'bg-white/80 backdrop-blur-xl border-white/80 hover:bg-white shadow-[0_2px_12px_rgba(4,32,63,0.03)]'
          }`}
        >
          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
            <span>Expected Profit</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-[#0E9AA7]" />
          </div>
          <div className="text-[17px] font-extrabold text-[#0E9AA7] mt-1 tabular-nums truncate">
            ৳{summaryMetrics.expectedCommission}
          </div>
          <div className="text-[10px] text-teal-700 font-semibold mt-0.5">
            Pending delivery
          </div>
        </div>
      </div>

      {/* 3. Search Bar + Filter Button (Height ~40-42px) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by order #, customer, phone..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setVisibleCount(20);
              }}
              className="w-full h-[40px] pl-9 pr-8 text-xs bg-white/90 backdrop-blur-xl border border-slate-200/90 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0E9AA7]/40 focus:border-[#0E9AA7] transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filters Modal Trigger */}
          <button
            onClick={() => {
              triggerHaptic('light');
              setIsFilterSheetOpen(true);
            }}
            className={`h-[40px] px-3.5 rounded-xl border flex items-center gap-1.5 text-xs font-semibold select-none transition-all ${
              activeFiltersCount > 0
                ? 'bg-[#04203F] text-white border-[#04203F] shadow-sm'
                : 'bg-white/90 backdrop-blur-xl border-slate-200/90 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filters</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#0E9AA7] text-white text-[10px] font-bold flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* Active Filter Chips & Result Count */}
        <div className="flex items-center justify-between flex-wrap gap-1.5 px-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {quickSummaryFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-teal-50 border border-teal-200 text-[#0E9AA7] text-[11px] font-semibold">
                <span>View: {quickSummaryFilter.replace('_', ' ')}</span>
                <X 
                  className="w-3 h-3 cursor-pointer hover:text-teal-900" 
                  onClick={() => setQuickSummaryFilter('all')} 
                />
              </span>
            )}
            {paymentFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-semibold">
                <span>Pay: {paymentFilter}</span>
                <X 
                  className="w-3 h-3 cursor-pointer hover:text-slate-900" 
                  onClick={() => setPaymentFilter('all')} 
                />
              </span>
            )}
            {dateFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-semibold">
                <span>Date: {dateFilter}</span>
                <X 
                  className="w-3 h-3 cursor-pointer hover:text-slate-900" 
                  onClick={() => setDateFilter('all')} 
                />
              </span>
            )}
            {sortOption !== 'newest' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-semibold">
                <span>Sort: {sortOption.replace('_', ' ')}</span>
                <X 
                  className="w-3 h-3 cursor-pointer hover:text-slate-900" 
                  onClick={() => setSortOption('newest')} 
                />
              </span>
            )}
            {activeFiltersCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="text-[11px] text-slate-500 hover:text-rose-600 font-semibold underline underline-offset-2 ml-1"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="text-[11px] font-medium text-slate-500 ml-auto whitespace-nowrap">
            {filteredAndSortedOrders.length} {filteredAndSortedOrders.length === 1 ? 'order' : 'orders'}
          </div>
        </div>
      </div>

      {/* 4. Scrollable Status Tab Bar (Clean underline indicator - NO chunky pill badges) */}
      <div className="border-b border-slate-200/80 -mx-1 px-1">
        <div className="flex items-center gap-5 overflow-x-auto scrollbar-none pb-0 text-xs">
          <button
            onClick={() => {
              triggerHaptic('light');
              setSelectedStatusTab('all');
              setVisibleCount(20);
            }}
            className={`pb-2.5 font-bold transition-all relative whitespace-nowrap cursor-pointer ${
              selectedStatusTab === 'all'
                ? 'text-[#04203F]'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>All Orders</span>
            <span className="ml-1 text-[11px] text-slate-400 font-normal">({tabCounts['all'] || 0})</span>
            {selectedStatusTab === 'all' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#04203F] rounded-full" />
            )}
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
            const count = tabCounts[st] || 0;
            const meta = statusMeta[st];
            const isSelected = selectedStatusTab === st;

            return (
              <button
                key={st}
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedStatusTab(st);
                  setVisibleCount(20);
                }}
                className={`pb-2.5 font-bold transition-all relative whitespace-nowrap cursor-pointer ${
                  isSelected ? 'text-[#04203F]' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{meta.label}</span>
                <span className="ml-1 text-[11px] text-slate-400 font-normal">({count})</span>
                {isSelected && (
                  <div 
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" 
                    style={{ backgroundColor: meta.accentColor }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Orders List / Skeletons / Empty States */}
      {loading ? (
        // Ticket Skeleton Loaders
        <div className="space-y-3">
          {[1, 2, 3].map((sk) => (
            <div
              key={sk}
              className="bg-white/80 rounded-2xl border border-slate-200/70 p-4 space-y-3 animate-pulse relative overflow-hidden"
            >
              <div className="w-1.5 absolute left-0 top-0 bottom-0 bg-slate-300" />
              <div className="flex items-center justify-between">
                <div className="h-4 w-28 bg-slate-200 rounded" />
                <div className="h-4 w-20 bg-slate-200 rounded-full" />
              </div>
              <div className="flex gap-3 items-center">
                <div className="w-12 h-12 bg-slate-200 rounded-xl shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3.5 bg-slate-200 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
              <div className="h-2 bg-slate-100 rounded-full my-2" />
              <div className="flex justify-between items-center pt-1 border-t border-dashed border-slate-200">
                <div className="h-4 w-24 bg-slate-200 rounded" />
                <div className="h-4 w-24 bg-slate-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredAndSortedOrders.length === 0 ? (
        // Empty States (Human, clean, no hype)
        <div className="bg-white/80 backdrop-blur-xl border border-white/80 rounded-3xl p-8 text-center space-y-3 shadow-xs my-6">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {orders.length === 0 ? 'No orders yet. Start your first order.' : 'No orders match these filters'}
            </h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
              {orders.length === 0
                ? 'Create a quick order for your customer or submit customized specifications.'
                : 'Try adjusting your search keywords, clearing status tabs, or changing date filters.'}
            </p>
          </div>

          {orders.length === 0 ? (
            !isAdminOrSuperAdmin && (
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setIsCreateModalOpen(true);
                }}
                className="mt-2 px-5 py-2.5 rounded-xl bg-[#04203F] hover:bg-[#0E9AA7] text-white text-xs font-bold transition-all shadow-sm"
              >
                Create Your First Order
              </button>
            )
          ) : (
            <button
              onClick={clearAllFilters}
              className="mt-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        // TICKET CARDS (Order Ticket / Delivery Slip Concept)
        <div className="space-y-3">
          {filteredAndSortedOrders.slice(0, visibleCount).map((order) => {
            const meta = statusMeta[order.status] || statusMeta.pending;
            const currentStepIdx = statusSteps.indexOf(order.status);
            const isTerminalState = order.status === 'cancelled' || order.status === 'returned';

            return (
              <div
                key={order.id}
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedOrderForDetails(order);
                }}
                className="bg-white/85 backdrop-blur-xl border border-white/80 rounded-2xl shadow-[0_4px_18px_rgba(4,32,63,0.04)] relative overflow-hidden transition-all duration-150 hover:shadow-md cursor-pointer select-none active:scale-[0.995]"
              >
                {/* Left Status Edge Indicator */}
                <div className={`w-1.5 absolute left-0 top-0 bottom-0 ${meta.edgeColor}`} />

                {/* Card Interior */}
                <div className="pl-4 pr-3.5 pt-3 pb-3">
                  
                  {/* Row 1: Order Number + Copy + Date + Status */}
                  <div className="flex items-center justify-between gap-2 pb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[14px] font-bold text-[#04203F] tracking-tight">
                        {order.orderNumber}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyText(order.orderNumber, 'order', order.id);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                        title="Copy Order #"
                      >
                        {copiedOrderId === order.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <span className="text-slate-300 font-light text-xs">·</span>
                      <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                        {formatOrderDateTime(order.createdAt)}
                      </span>
                    </div>

                    {/* Status Chip (One accent per status color, no candy badges) */}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold border ${meta.bgColor} ${meta.textColor}`}>
                      {meta.label}
                    </span>
                  </div>

                  {/* Row 2: Customer info + Quick Call & WhatsApp Buttons */}
                  <div className="flex items-center justify-between gap-2 py-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-bold text-slate-800 truncate">
                          {order.customerName}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 truncate">
                          {order.customerPhone}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{order.customerAddress || 'No address specified'}</span>
                      </p>
                    </div>

                    {/* 1-Tap Direct Call & WhatsApp Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={`tel:${order.customerPhone}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerHaptic('light');
                        }}
                        className="h-8 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                        title="Call Customer"
                      >
                        <Phone className="w-3 h-3 text-slate-600" />
                        <span className="hidden sm:inline">Call</span>
                      </a>
                      <a
                        href={`https://wa.me/880${order.customerPhone.replace(/\D/g, '').replace(/^0+/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerHaptic('light');
                        }}
                        className="h-8 px-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-semibold flex items-center gap-1 transition-colors border border-emerald-200"
                        title="WhatsApp Customer"
                      >
                        <MessageCircle className="w-3 h-3 text-emerald-600" />
                        <span className="hidden sm:inline">WhatsApp</span>
                      </a>
                    </div>
                  </div>

                  {/* Row 3: Product Thumbnail & Title Preview */}
                  <div className="flex items-center gap-2.5 bg-slate-50/70 p-2 rounded-xl mt-2 border border-slate-200/50">
                    {order.productImage ? (
                      <img
                        src={order.productImage}
                        alt={order.productName}
                        className="w-10 h-10 object-cover rounded-lg border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-200 text-slate-500 text-[9px] font-bold flex items-center justify-center shrink-0">
                        ITEM
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-slate-800 truncate">
                        {order.productName}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                        <span>Qty: <strong className="text-slate-700">{order.quantity}</strong></span>
                        {order.variantColorName && (
                          <>
                            <span>·</span>
                            <span className="text-amber-800 font-medium">Color: {order.variantColorName}</span>
                          </>
                        )}
                        {order.deliveryPreference && (
                          <>
                            <span>·</span>
                            <span className="capitalize">{order.deliveryPreference.replace('_', ' ')}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Row 4: Progress Rail (Horizontal Step Delivery Journey) */}
                  <div className="mt-3 pt-1">
                    {isTerminalState ? (
                      <div className="flex items-center gap-1.5 text-xs font-semibold py-1 px-2.5 rounded-xl bg-slate-100 text-slate-700">
                        <XCircle className={`w-3.5 h-3.5 ${order.status === 'cancelled' ? 'text-rose-600' : 'text-slate-500'}`} />
                        <span>Order is {meta.label}</span>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-medium text-slate-400">
                          <span>Pending</span>
                          <span>Accepted</span>
                          <span>Packing</span>
                          <span>Ready</span>
                          <span>Shipped</span>
                          <span>Delivered</span>
                        </div>
                        {/* Rail Nodes & Connector */}
                        <div className="relative flex items-center justify-between px-1">
                          <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-1 bg-slate-100 rounded-full" />
                          <div 
                            className="absolute left-2 top-1/2 -translate-y-1/2 h-1 bg-[#0E9AA7] rounded-full transition-all duration-300"
                            style={{ 
                              width: `${Math.max(0, Math.min(100, (currentStepIdx / (statusSteps.length - 1)) * 100))}%` 
                            }}
                          />
                          {statusSteps.map((st, idx) => {
                            const isReached = currentStepIdx >= idx;
                            const isCurrent = currentStepIdx === idx;
                            return (
                              <div
                                key={st}
                                className={`relative z-10 w-3 h-3 rounded-full border-2 transition-all ${
                                  isReached 
                                    ? 'bg-[#0E9AA7] border-white ring-2 ring-[#0E9AA7]/40 shadow-xs' 
                                    : 'bg-white border-slate-300'
                                } ${isCurrent ? 'scale-125' : ''}`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tactile Perforated / Notched Divider */}
                  <div className="relative my-3 py-0.5">
                    {/* Left Notch */}
                    <div className="absolute -left-5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-100 border border-slate-200/80 shadow-inner" />
                    {/* Dashed line */}
                    <div className="border-t border-dashed border-slate-200 mx-1" />
                    {/* Right Notch */}
                    <div className="absolute -right-4.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-100 border border-slate-200/80 shadow-inner" />
                  </div>

                  {/* Row 5: Financials & Commission */}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-medium block">Total Payable</span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[15px] font-bold text-slate-900 tabular-nums">
                          ৳{order.totalAmount}
                        </span>
                        <span className="text-[10px] text-slate-500 font-semibold uppercase px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200">
                          {order.paymentStatus === 'paid' ? 'Paid' : order.paymentStatus === 'partial' ? 'Partial' : 'COD'}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-medium block">Your Commission</span>
                      <div className="flex items-center gap-1.5 justify-end">
                        <span className="text-[15px] font-extrabold text-emerald-700 tabular-nums">
                          ৳{order.sellAmount}
                        </span>
                        {order.status === 'delivered' ? (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                            Credited
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Admin Fast Status Controls if Admin viewing */}
                  {isAdminOrSuperAdmin && (
                    <div 
                      onClick={(e) => e.stopPropagation()} 
                      className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2"
                    >
                      <span className="text-[11px] font-bold text-slate-500">Admin Move Status:</span>
                      <select
                        disabled={updatingStatusId === order.id}
                        value={order.status}
                        onChange={(e) => handleUpdateOrderStatus(order, e.target.value as OrderStatus)}
                        className="text-[11px] font-semibold bg-white border border-slate-300 text-slate-800 rounded-lg px-2 py-1 outline-none cursor-pointer"
                      >
                        {statusSteps.map((st) => (
                          <option key={st} value={st}>
                            {statusMeta[st].label}
                          </option>
                        ))}
                        <option value="cancelled">Cancelled</option>
                        <option value="returned">Returned</option>
                      </select>
                    </div>
                  )}

                </div>
              </div>
            );
          })}

          {/* Pagination / Load More Button */}
          {filteredAndSortedOrders.length > visibleCount && (
            <div className="text-center pt-2 pb-4">
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setVisibleCount((prev) => prev + 20);
                }}
                className="px-6 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-slate-900 font-bold text-xs shadow-xs hover:border-slate-300 transition-all select-none"
              >
                Load More Orders (Showing {visibleCount} of {filteredAndSortedOrders.length})
              </button>
            </div>
          )}
        </div>
      )}

      {/* 6. Order Detail Bottom Sheet (Opens on card click) */}
      {selectedOrderForDetails && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200/80 max-h-[92vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
            
            {/* Sheet Handle & Header */}
            <div className="px-5 pt-3 pb-3 border-b border-slate-100">
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3 sm:hidden" />
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[15px] font-bold text-[#04203F]">
                      {selectedOrderForDetails.orderNumber}
                    </span>
                    <button
                      onClick={() => handleCopyText(selectedOrderForDetails.orderNumber, 'order', selectedOrderForDetails.id)}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded"
                      title="Copy Order #"
                    >
                      {copiedOrderId === selectedOrderForDetails.id ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                    Placed {formatOrderDateTime(selectedOrderForDetails.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${statusMeta[selectedOrderForDetails.status]?.bgColor || 'bg-slate-100'} ${statusMeta[selectedOrderForDetails.status]?.textColor || 'text-slate-700'}`}>
                    {statusMeta[selectedOrderForDetails.status]?.label || selectedOrderForDetails.status}
                  </span>
                  <button
                    onClick={() => setSelectedOrderForDetails(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Sheet Body (Scrollable) */}
            <div className="p-5 space-y-4 overflow-y-auto text-xs flex-1">
              
              {/* Product Info Box */}
              <div className="flex gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
                {selectedOrderForDetails.productImage ? (
                  <img
                    src={selectedOrderForDetails.productImage}
                    alt={selectedOrderForDetails.productName}
                    className="w-16 h-16 object-cover rounded-xl border border-slate-200 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-slate-200 flex items-center justify-center text-slate-400 text-xs font-bold shrink-0">
                    ITEM
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-slate-900 text-sm leading-snug">
                    {selectedOrderForDetails.productName}
                  </h4>
                  {selectedOrderForDetails.variantColorName && (
                    <span className="inline-block mt-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      Variant: {selectedOrderForDetails.variantColorName}
                    </span>
                  )}
                  <div className="text-[11px] text-slate-500 mt-1.5">
                    Qty: <strong className="text-slate-900">{selectedOrderForDetails.quantity}</strong> · Reseller Base: ৳{selectedOrderForDetails.unitResellerPrice} · Selling: ৳{selectedOrderForDetails.sellingPrice !== undefined ? selectedOrderForDetails.sellingPrice : selectedOrderForDetails.unitRetailPrice}
                  </div>
                </div>
              </div>

              {/* Customer & Address Details */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70 space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                  <span>Customer & Delivery Details</span>
                  <button
                    onClick={() => handleCopyText(selectedOrderForDetails.customerAddress, 'address', selectedOrderForDetails.id)}
                    className="text-blue-600 hover:text-blue-700 flex items-center gap-1 font-semibold text-[11px] capitalize tracking-normal"
                  >
                    {copiedAddressId === selectedOrderForDetails.id ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="text-emerald-700">Address Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Address</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="text-slate-900 font-bold text-[13px]">
                  {selectedOrderForDetails.customerName}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-600 text-xs">
                    {selectedOrderForDetails.customerPhone}
                  </span>
                  <a
                    href={`tel:${selectedOrderForDetails.customerPhone}`}
                    className="p-1 text-slate-500 hover:text-blue-600 rounded"
                    title="Call"
                  >
                    <Phone className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={`https://wa.me/880${selectedOrderForDetails.customerPhone.replace(/\D/g, '').replace(/^0+/, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 text-emerald-600 hover:text-emerald-700 rounded"
                    title="WhatsApp"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                  </a>
                </div>
                <p className="text-slate-600 text-xs leading-relaxed">
                  {selectedOrderForDetails.customerAddress}
                </p>
              </div>

              {/* Courier & Tracking (if available or standard fallback) */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70 space-y-2">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">
                  Courier Delivery & Shipping
                </span>
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Courier Partner</span>
                    <span className="font-bold text-slate-800">
                      {selectedOrderForDetails.customizations?.courierName || 'Steadfast Courier'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Delivery Type</span>
                    <span className="font-bold text-slate-800 capitalize">
                      {selectedOrderForDetails.deliveryPreference?.replace('_', ' ') || 'Standard Delivery'}
                    </span>
                  </div>
                </div>

                {/* Tracking ID with copy & link */}
                {(selectedOrderForDetails.customizations?.trackingId || selectedOrderForDetails.invoiceNumber) && (
                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Tracking / Consignment ID</span>
                      <span className="font-mono font-bold text-[#04203F] text-xs">
                        {selectedOrderForDetails.customizations?.trackingId || `SF-${selectedOrderForDetails.orderNumber.replace(/\D/g, '')}`}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopyText(
                        selectedOrderForDetails.customizations?.trackingId || `SF-${selectedOrderForDetails.orderNumber.replace(/\D/g, '')}`,
                        'tracking',
                        selectedOrderForDetails.id
                      )}
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1 hover:bg-slate-50"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy Tracking</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Special Instructions & Customizations (if present) */}
              {(selectedOrderForDetails.specialInstructions || selectedOrderForDetails.giftWrap || selectedOrderForDetails.messageCard) && (
                <div className="bg-indigo-50/50 p-3.5 rounded-2xl border border-indigo-200/70 space-y-2 text-indigo-950">
                  <span className="text-indigo-900 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1">
                    <ClipboardEdit className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Special Instructions & Notes</span>
                  </span>
                  {selectedOrderForDetails.specialInstructions && (
                    <p className="text-slate-800 bg-white p-2 rounded-xl border border-indigo-100 text-xs">
                      "{selectedOrderForDetails.specialInstructions}"
                    </p>
                  )}
                  {selectedOrderForDetails.giftWrap && (
                    <div className="flex items-center gap-1.5 text-pink-700 font-semibold text-xs">
                      <Gift className="w-3.5 h-3.5 text-pink-600" />
                      <span>Gift Wrapped (+৳100)</span>
                    </div>
                  )}
                  {selectedOrderForDetails.messageCard && (
                    <p className="text-slate-700 italic bg-white p-2 rounded-xl border border-pink-100 text-xs">
                      Card: "{selectedOrderForDetails.messageCard}"
                    </p>
                  )}
                </div>
              )}

              {/* Financial Breakdown Table */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-2">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">
                  Financial & Payment Breakdown
                </span>
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Item Selling Subtotal</span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      ৳{(selectedOrderForDetails.sellingPrice || selectedOrderForDetails.unitRetailPrice || 0) * (selectedOrderForDetails.quantity || 1)}
                    </span>
                  </div>
                  {selectedOrderForDetails.deliveryCost ? (
                    <div className="flex justify-between">
                      <span>Delivery Charge</span>
                      <span className="font-semibold text-slate-900 tabular-nums">৳{selectedOrderForDetails.deliveryCost}</span>
                    </div>
                  ) : null}
                  {selectedOrderForDetails.giftWrap && (
                    <div className="flex justify-between">
                      <span>Gift Wrapping</span>
                      <span className="font-semibold text-slate-900 tabular-nums">৳100</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 border-t border-slate-100 font-bold text-slate-900 text-sm">
                    <span>Total Customer Payable</span>
                    <span className="tabular-nums">৳{selectedOrderForDetails.totalAmount}</span>
                  </div>
                  <div className="flex justify-between pt-1 text-emerald-800 font-bold bg-emerald-50/70 p-2 rounded-xl border border-emerald-200">
                    <span>Your Commission (Profit)</span>
                    <span className="tabular-nums text-sm">৳{selectedOrderForDetails.sellAmount}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Sheet Footer Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Download Cash Memo / Invoice */}
                <button
                  onClick={() => {
                    const toInv = selectedOrderForDetails;
                    setSelectedOrderForDetails(null);
                    setSelectedOrderForInvoice(toInv);
                  }}
                  className="h-10 px-3.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center gap-1.5 transition-colors border border-blue-200"
                >
                  <FileText className="w-4 h-4" />
                  <span>ক্যাশ মেমো</span>
                </button>

                {/* Contact Support */}
                <button
                  onClick={() => handleContactSupport(selectedOrderForDetails)}
                  className="h-10 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Support</span>
                </button>

                {/* Reorder */}
                <button
                  onClick={() => handleReorder(selectedOrderForDetails)}
                  className="h-10 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reorder</span>
                </button>

                {/* For Delivered Orders: Product Review */}
                {selectedOrderForDetails.status === 'delivered' && (
                  <button
                    onClick={() => {
                      const pId = selectedOrderForDetails.productId;
                      setSelectedOrderForDetails(null);
                      setSelectedReviewProductId(pId);
                    }}
                    className="h-10 px-3.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs flex items-center gap-1.5 transition-colors border border-amber-200"
                  >
                    <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                    <span>Review</span>
                  </button>
                )}

                {/* For Pending Orders: Cancel Request */}
                {selectedOrderForDetails.status === 'pending' && (
                  <button
                    disabled={cancellingOrderId === selectedOrderForDetails.id}
                    onClick={() => handleCancelPendingOrder(selectedOrderForDetails)}
                    className="h-10 px-3.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1.5 transition-colors border border-rose-200 disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Cancel Order</span>
                  </button>
                )}
              </div>

              <button
                onClick={() => setSelectedOrderForDetails(null)}
                className="h-10 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs ml-auto transition-colors"
              >
                Done
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 7. Filter Bottom Sheet */}
      {isFilterSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200/80 p-5 space-y-4 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#0E9AA7]" />
                <span>Filter & Sort Orders</span>
              </h3>
              <button
                onClick={() => setIsFilterSheetOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Date Range */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase">Date Range</label>
              <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                {[
                  { id: 'all', label: 'All Time' },
                  { id: 'today', label: 'Today' },
                  { id: 'week', label: 'Last 7 Days' },
                  { id: 'month', label: 'This Month' },
                ].map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDateFilter(d.id as any)}
                    className={`py-2 px-3 rounded-xl border text-center transition-all ${
                      dateFilter === d.id
                        ? 'bg-[#04203F] text-white border-[#04203F]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Status */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase">Payment Status</label>
              <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'paid', label: 'Paid' },
                  { id: 'unpaid', label: 'COD' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPaymentFilter(p.id as any)}
                    className={`py-2 px-3 rounded-xl border text-center transition-all ${
                      paymentFilter === p.id
                        ? 'bg-[#04203F] text-white border-[#04203F]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort Options */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase">Sort By</label>
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as any)}
                className="w-full py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="amount_high">Order Amount (High to Low)</option>
                <option value="amount_low">Order Amount (Low to High)</option>
                <option value="profit_high">Highest Commission (Profit)</option>
              </select>
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-100">
              <button
                onClick={clearAllFilters}
                className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
              >
                Reset
              </button>
              <button
                onClick={() => setIsFilterSheetOpen(false)}
                className="py-2.5 px-6 rounded-xl bg-[#04203F] hover:bg-[#0E9AA7] text-white text-xs font-bold transition-all shadow-sm flex-1 text-center"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Modal: Quick Order Form */}
      <CreateOrderModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setReorderProduct(null);
        }}
        user={user}
        initialProduct={reorderProduct}
        onOrderCreated={() => fetchOrders()}
      />

      {/* 10. Modal: Custom Order Form */}
      {isCustomOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-3xl my-auto">
            <OrderCustomizationForm
              user={user}
              onSuccess={() => {
                setIsCustomOrderModalOpen(false);
                fetchOrders();
              }}
              onCancel={() => setIsCustomOrderModalOpen(false)}
            />
          </div>
        </div>
      )}

      {/* 11. Modal: Cash Memo / Invoice */}
      <InvoiceModal
        isOpen={!!selectedOrderForInvoice}
        order={selectedOrderForInvoice}
        currentUser={user}
        onClose={() => setSelectedOrderForInvoice(null)}
        onInvoiceGenerated={(updatedOrder) => {
          setOrders((prev) =>
            prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
          );
        }}
      />

      {/* 12. Modal: Product Review Form */}
      {selectedReviewProductId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-2xl my-auto">
            <ProductReviewForm
              user={user}
              initialProductId={selectedReviewProductId}
              onClose={() => setSelectedReviewProductId(null)}
              onSuccessRedirect={() => setSelectedReviewProductId(null)}
            />
          </div>
        </div>
      )}

    </div>
  );
};
