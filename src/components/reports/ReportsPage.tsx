import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Order, UserProfile, Product, Wallet, WalletTransaction } from '../../types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, 
  PieChart, Pie, Cell, AreaChart, Area, Legend 
} from 'recharts';
import { 
  TrendingUp, ShoppingBag, DollarSign, Package, Users, Wallet as WalletIcon, 
  Calendar, Filter, ArrowUpDown, ChevronDown, CheckCircle2, Clock, AlertTriangle, 
  Loader2, RefreshCw, MessageSquare, RotateCw
} from 'lucide-react';
import { AdminFeedbackList } from '../feedback/AdminFeedbackList';
import { usePageRefresh, useRefresh } from '../../context/RefreshContext';

type DatePreset = 'today' | 'week' | 'month' | 'year' | 'custom';

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  accepted: '#3b82f6',
  packing: '#8b5cf6',
  ready_to_ship: '#6366f1',
  shipped: '#06b6d4',
  delivered: '#10b981',
  cancelled: '#f43f5e',
  returned: '#64748b',
};

interface ReportsPageProps {
  user?: UserProfile;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'sales' | 'orders' | 'products' | 'commission' | 'wallet' | 'resellers' | 'feedback'>('sales');
  
  // Date Filters
  const [datePreset, setDatePreset] = useState<DatePreset>('month');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Loaded Raw Data
  const [loading, setLoading] = useState<boolean>(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [wallets, setWallets] = useState<Record<string, Wallet>>({});
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);

  // Reseller Table Sorting
  const [resellerSortField, setResellerSortField] = useState<'fullName' | 'shopName' | 'orderCount' | 'totalSales' | 'createdAt' | 'status'>('totalSales');
  const [resellerSortOrder, setResellerSortOrder] = useState<'asc' | 'desc'>('desc');

  const { isRefreshing, showToast, refreshCurrentPage } = useRefresh();

  const handleRefresh = async () => {
    await fetchAllReportData(true);
  };

  usePageRefresh('reports', handleRefresh);

  useEffect(() => {
    fetchAllReportData();
  }, []);

  const fetchAllReportData = async (isManualRefresh = false) => {
    setLoading(true);
    try {
      const [ordersSnap, productsSnap, usersSnap, walletsSnap, txSnap] = await Promise.all([
        getDocs(collection(db, 'orders')),
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'wallets')),
        getDocs(collection(db, 'transactions'))
      ]);

      const oList: Order[] = [];
      ordersSnap.forEach((d) => oList.push(Object.assign({ id: d.id }, d.data()) as unknown as Order));

      const pList: Product[] = [];
      productsSnap.forEach((d) => pList.push(Object.assign({ id: d.id }, d.data()) as unknown as Product));

      const uList: UserProfile[] = [];
      usersSnap.forEach((d) => uList.push(Object.assign({ id: d.id }, d.data()) as unknown as UserProfile));

      const wMap: Record<string, Wallet> = {};
      walletsSnap.forEach((d) => {
        wMap[d.id] = d.data() as Wallet;
      });

      const tList: WalletTransaction[] = [];
      txSnap.forEach((d) => tList.push(Object.assign({ id: d.id }, d.data()) as unknown as WalletTransaction));

      setOrders(oList);
      setProducts(pList);
      setUsers(uList);
      setWallets(wMap);
      setTransactions(tList);

      if (isManualRefresh) {
        showToast('✓ Analytics reports updated', 'success');
      }
    } catch (err) {
      console.error('Error fetching report data:', err);
      if (isManualRefresh) {
        showToast('✗ Failed to refresh report data', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Helper date parsing
  const getDateRange = () => {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    if (datePreset === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (datePreset === 'week') {
      const day = now.getDay();
      start.setDate(now.getDate() - day);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (datePreset === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (datePreset === 'year') {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    } else if (datePreset === 'custom') {
      start = startDate ? new Date(startDate) : new Date(0);
      end = endDate ? new Date(endDate) : new Date();
      end.setHours(23, 59, 59, 999);
    }
    return { start, end };
  };

  // Filter Orders by Date Range
  const filteredOrders = useMemo(() => {
    const { start, end } = getDateRange();
    return orders.filter((o) => {
      const orderDate = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt || 0);
      return orderDate >= start && orderDate <= end;
    });
  }, [orders, datePreset, startDate, endDate]);

  // Filter Transactions by Date Range
  const filteredTransactions = useMemo(() => {
    const { start, end } = getDateRange();
    return transactions.filter((t) => {
      const txDate = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt || 0);
      return txDate >= start && txDate <= end;
    });
  }, [transactions, datePreset, startDate, endDate]);

  // 1. Sales Report Calculations
  const totalSalesAmount = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  }, [filteredOrders]);

  const totalOrdersCount = filteredOrders.length;
  const avgOrderValue = totalOrdersCount > 0 ? Math.round(totalSalesAmount / totalOrdersCount) : 0;

  const salesTrendData = useMemo(() => {
    const { start, end } = getDateRange();
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24));

    if (diffDays <= 31) {
      // Group by Day
      const daysMap: Record<string, { label: string; sales: number; count: number }> = {};
      filteredOrders.forEach((o) => {
        const d = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt || 0);
        const dayStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        if (!daysMap[dayStr]) daysMap[dayStr] = { label: dayStr, sales: 0, count: 0 };
        daysMap[dayStr].sales += o.totalAmount || 0;
        daysMap[dayStr].count += 1;
      });
      return Object.values(daysMap);
    } else {
      // Group by Month
      const monthMap: Record<string, { label: string; sales: number; count: number }> = {};
      filteredOrders.forEach((o) => {
        const d = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt || 0);
        const mStr = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
        if (!monthMap[mStr]) monthMap[mStr] = { label: mStr, sales: 0, count: 0 };
        monthMap[mStr].sales += o.totalAmount || 0;
        monthMap[mStr].count += 1;
      });
      return Object.values(monthMap);
    }
  }, [filteredOrders, datePreset, startDate, endDate]);

  // 2. Order Status Breakdown
  const orderStatusData = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    filteredOrders.forEach((o) => {
      const st = o.status || 'pending';
      statusCounts[st] = (statusCounts[st] || 0) + 1;
    });
    return Object.entries(statusCounts).map(([status, count]) => ({
      name: status.replace('_', ' ').toUpperCase(),
      statusKey: status,
      value: count,
    }));
  }, [filteredOrders]);

  // 3. Product Sales Report (Top 10)
  const productSalesReport = useMemo(() => {
    const map: Record<string, { id: string; name: string; unitsSold: number; revenue: number; stock: number }> = {};
    
    // Seed with existing products
    products.forEach((p) => {
      map[p.id] = { id: p.id, name: p.name, unitsSold: 0, revenue: 0, stock: p.stock || 0 };
    });

    filteredOrders.forEach((o) => {
      if (!map[o.productId]) {
        map[o.productId] = { id: o.productId, name: o.productName, unitsSold: 0, revenue: 0, stock: 0 };
      }
      map[o.productId].unitsSold += o.quantity || 1;
      map[o.productId].revenue += o.totalAmount || 0;
    });

    const list = Object.values(map);
    list.sort((a, b) => b.unitsSold - a.unitsSold);
    return list;
  }, [products, filteredOrders]);

  const top10ProductsChart = useMemo(() => {
    return productSalesReport.slice(0, 10).map((p) => ({
      name: p.name.length > 20 ? p.name.substring(0, 18) + '...' : p.name,
      units: p.unitsSold,
      revenue: p.revenue,
    }));
  }, [productSalesReport]);

  // 4. Commission Report
  const commissionReport = useMemo(() => {
    let totalPaid = 0;
    const resellerMap: Record<string, { resellerId: string; name: string; shopName: string; deliveredOrders: number; commissionEarned: number; totalWithdrawn: number }> = {};

    users.filter((u) => u.role === 'reseller').forEach((u) => {
      const w = wallets[u.uid] || { balance: 0, totalEarned: 0, totalWithdrawn: 0 };
      resellerMap[u.uid] = {
        resellerId: u.uid,
        name: u.fullName,
        shopName: u.shopName,
        deliveredOrders: 0,
        commissionEarned: 0,
        totalWithdrawn: w.totalWithdrawn || 0,
      };
    });

    filteredOrders.forEach((o) => {
      if (o.status === 'delivered') {
        if (!resellerMap[o.resellerId]) {
          resellerMap[o.resellerId] = {
            resellerId: o.resellerId,
            name: o.resellerName || 'Reseller',
            shopName: o.resellerShopName || '',
            deliveredOrders: 0,
            commissionEarned: 0,
            totalWithdrawn: 0,
          };
        }
        resellerMap[o.resellerId].deliveredOrders += 1;
        resellerMap[o.resellerId].commissionEarned += o.sellAmount || 0;
        totalPaid += o.sellAmount || 0;
      }
    });

    return { totalPaid, list: Object.values(resellerMap) };
  }, [users, wallets, filteredOrders]);

  // 5. Wallet Report
  const walletReportList = useMemo(() => {
    return users
      .filter((u) => u.role === 'reseller')
      .map((u) => {
        const w = wallets[u.uid] || { balance: 0, totalEarned: 0, totalWithdrawn: 0 };
        // Find last transaction
        const userTxs = transactions.filter((t) => t.resellerId === u.uid);
        let lastTxDate = 'No activity';
        if (userTxs.length > 0) {
          userTxs.sort((a, b) => {
            const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
            const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
            return timeB - timeA;
          });
          const d = userTxs[0].createdAt?.toDate ? userTxs[0].createdAt.toDate() : new Date(userTxs[0].createdAt || 0);
          lastTxDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        }

        return {
          uid: u.uid,
          name: u.fullName,
          shopName: u.shopName,
          balance: w.balance || 0,
          totalEarned: w.totalEarned || 0,
          totalWithdrawn: w.totalWithdrawn || 0,
          lastTxDate,
        };
      });
  }, [users, wallets, transactions]);

  // 6. Reseller Report (Sortable)
  const resellerReportList = useMemo(() => {
    const list = users
      .filter((u) => u.role === 'reseller')
      .map((u) => {
        const userOrders = orders.filter((o) => o.resellerId === u.uid);
        const totalSales = userOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const joinDate = u.createdAt?.toDate ? u.createdAt.toDate() : new Date(u.createdAt || 0);

        return {
          uid: u.uid,
          fullName: u.fullName,
          shopName: u.shopName,
          mobile: u.mobile,
          orderCount: userOrders.length,
          totalSales,
          createdAt: joinDate,
          status: u.status,
        };
      });

    list.sort((a, b) => {
      let valA: any = a[resellerSortField];
      let valB: any = b[resellerSortField];

      if (resellerSortField === 'createdAt') {
        valA = a.createdAt.getTime();
        valB = b.createdAt.getTime();
      }

      if (valA < valB) return resellerSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return resellerSortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [users, orders, resellerSortField, resellerSortOrder]);

  const toggleResellerSort = (field: typeof resellerSortField) => {
    if (resellerSortField === field) {
      setResellerSortOrder(resellerSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setResellerSortField(field);
      setResellerSortOrder('desc');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Date Range Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Analytics & Master Reports</h2>
          <p className="text-xs text-slate-500 mt-1">Real-time performance metrics across sales, inventory, commission, and resellers network.</p>
        </div>

        {/* Date Filter Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {(['today', 'week', 'month', 'year', 'custom'] as DatePreset[]).map((preset) => (
            <button
              key={preset}
              onClick={() => setDatePreset(preset)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all capitalize ${
                datePreset === preset
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {preset === 'week' ? 'This Week' : preset === 'month' ? 'This Month' : preset === 'year' ? 'This Year' : preset}
            </button>
          ))}

          <button
            type="button"
            onClick={() => refreshCurrentPage()}
            disabled={isRefreshing || loading}
            className="p-2 text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 disabled:bg-slate-100 disabled:text-slate-400 rounded-xl transition-all cursor-pointer flex items-center gap-1"
            title="Refresh Report Data"
          >
            <RotateCw className={`w-4 h-4 ${isRefreshing || loading ? 'animate-spin' : ''}`} />
            <span className="text-[11px] font-bold hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Custom Date Picker row */}
      {datePreset === 'custom' && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
      )}

      {/* Sub Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-xl px-2 pt-2 gap-1 overflow-x-auto">
        {[
          { id: 'sales', label: 'Sales Report', icon: TrendingUp },
          { id: 'orders', label: 'Order Report', icon: ShoppingBag },
          { id: 'products', label: 'Product Report', icon: Package },
          { id: 'commission', label: 'Commission Report', icon: DollarSign },
          { id: 'wallet', label: 'Wallet Report', icon: WalletIcon },
          { id: 'resellers', label: 'Reseller Report', icon: Users },
          { id: 'feedback', label: 'Reseller Feedback', icon: MessageSquare },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg'
                  : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 text-slate-400 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-xs font-semibold">Loading report metrics...</p>
        </div>
      ) : (
        <div>
          {/* TAB 1: SALES REPORT */}
          {activeTab === 'sales' && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Total Sales Amount</span>
                  <div className="text-2xl font-black text-slate-900">৳{totalSalesAmount.toLocaleString()}</div>
                  <p className="text-[11px] text-emerald-600 font-medium mt-1">In selected timeframe</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Total Orders</span>
                  <div className="text-2xl font-black text-slate-900">{totalOrdersCount} Orders</div>
                  <p className="text-[11px] text-blue-600 font-medium mt-1">Placed across platform</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Average Order Value</span>
                  <div className="text-2xl font-black text-slate-900">৳{avgOrderValue.toLocaleString()}</div>
                  <p className="text-[11px] text-purple-600 font-medium mt-1">Per completed cart</p>
                </div>
              </div>

              {/* Chart */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900">Sales Trend & Volume</h3>
                <div className="h-72 w-full">
                  {salesTrendData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">No sales data for this period.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={salesTrendData}>
                        <defs>
                          <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(value: any) => [`৳${Number(value).toLocaleString()}`, 'Sales']} />
                        <Area type="monotone" dataKey="sales" stroke="#2563eb" fillOpacity={1} fill="url(#colorSales)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ORDER REPORT */}
          {activeTab === 'orders' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Pie Chart */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center">
                  <h3 className="text-sm font-bold text-slate-900 w-full mb-4">Status Breakdown</h3>
                  <div className="h-56 w-full">
                    {orderStatusData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-slate-400">No order data available.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={orderStatusData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={(entry) => `${entry.name} (${entry.value})`}
                          >
                            {orderStatusData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.statusKey] || '#3b82f6'} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Filtered Orders Table */}
                <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-slate-100 font-bold text-xs text-slate-900 uppercase tracking-wider">
                    Orders in Selected Date Range ({filteredOrders.length})
                  </div>
                  <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                        <tr>
                          <th className="p-3">Order #</th>
                          <th className="p-3">Customer</th>
                          <th className="p-3">Reseller</th>
                          <th className="p-3 text-right">Amount</th>
                          <th className="p-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredOrders.length === 0 ? (
                          <tr><td colSpan={5} className="p-6 text-center text-slate-400">No orders found for this timeframe.</td></tr>
                        ) : (
                          filteredOrders.slice(0, 10).map((o) => (
                            <tr key={o.id} className="hover:bg-slate-50">
                              <td className="p-3 font-mono font-bold text-slate-900">{o.orderNumber}</td>
                              <td className="p-3 font-semibold text-slate-800">{o.customerName}</td>
                              <td className="p-3 text-slate-600">{o.resellerName}</td>
                              <td className="p-3 text-right font-bold text-slate-900">৳{o.totalAmount}</td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                                  {o.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PRODUCT REPORT */}
          {activeTab === 'products' && (
            <div className="space-y-6">
              {/* Top 10 Best Sellers Chart */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900">Top 10 Best-Selling Products (Units Sold)</h3>
                <div className="h-72 w-full">
                  {top10ProductsChart.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">No product sales yet.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={top10ProductsChart} margin={{ left: 20, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(value: any) => [`${value} units`, 'Sold']} />
                        <Bar dataKey="units" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Product Detailed Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 font-bold text-xs text-slate-900 uppercase tracking-wider">
                  Product Sales & Inventory Performance
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                      <tr>
                        <th className="p-3">Product Name</th>
                        <th className="p-3 text-center">Units Sold</th>
                        <th className="p-3 text-right">Revenue Generated</th>
                        <th className="p-3 text-center">Current Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {productSalesReport.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="p-3 font-bold text-slate-900">{p.name}</td>
                          <td className="p-3 text-center font-bold text-blue-600">{p.unitsSold}</td>
                          <td className="p-3 text-right font-bold text-emerald-600">৳{p.revenue.toLocaleString()}</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              p.stock <= 5 ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {p.stock} units
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: COMMISSION REPORT */}
          {activeTab === 'commission' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm max-w-sm">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Total Paid Reseller Commission</span>
                <div className="text-2xl font-black text-emerald-600">৳{commissionReport.totalPaid.toLocaleString()}</div>
                <p className="text-[11px] text-slate-500 font-medium mt-1">From delivered customer orders</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 font-bold text-xs text-slate-900 uppercase tracking-wider">
                  Reseller Commission Breakdown
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                      <tr>
                        <th className="p-3">Reseller Name</th>
                        <th className="p-3">Shop Name</th>
                        <th className="p-3 text-center">Orders Delivered</th>
                        <th className="p-3 text-right">Total Commission Earned</th>
                        <th className="p-3 text-right">Total Withdrawn</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {commissionReport.list.map((r) => (
                        <tr key={r.resellerId} className="hover:bg-slate-50">
                          <td className="p-3 font-bold text-slate-900">{r.name}</td>
                          <td className="p-3 text-slate-600">{r.shopName}</td>
                          <td className="p-3 text-center font-bold text-slate-800">{r.deliveredOrders}</td>
                          <td className="p-3 text-right font-bold text-emerald-600">৳{r.commissionEarned.toLocaleString()}</td>
                          <td className="p-3 text-right font-semibold text-slate-700">৳{r.totalWithdrawn.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: WALLET REPORT */}
          {activeTab === 'wallet' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 font-bold text-xs text-slate-900 uppercase tracking-wider">
                Reseller Wallet Balances & Lifetime Payouts
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Reseller Name</th>
                      <th className="p-3">Shop Name</th>
                      <th className="p-3 text-right">Available Balance</th>
                      <th className="p-3 text-right">Lifetime Earned</th>
                      <th className="p-3 text-right">Lifetime Withdrawn</th>
                      <th className="p-3">Last Activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {walletReportList.map((w) => (
                      <tr key={w.uid} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-900">{w.name}</td>
                        <td className="p-3 text-slate-600">{w.shopName}</td>
                        <td className="p-3 text-right font-bold text-emerald-600">৳{w.balance.toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-blue-600">৳{w.totalEarned.toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-slate-700">৳{w.totalWithdrawn.toLocaleString()}</td>
                        <td className="p-3 text-slate-500 font-mono text-[11px]">{w.lastTxDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: RESELLER REPORT (SORTABLE) */}
          {activeTab === 'resellers' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                  Reseller Directory Performance & Account Status
                </span>
                <span className="text-xs text-slate-500">Click headers to sort</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] cursor-pointer select-none">
                    <tr>
                      <th className="p-3" onClick={() => toggleResellerSort('fullName')}>
                        <div className="flex items-center gap-1">
                          <span>Reseller Name</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                      <th className="p-3" onClick={() => toggleResellerSort('shopName')}>
                        <div className="flex items-center gap-1">
                          <span>Shop Name</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                      <th className="p-3 text-center" onClick={() => toggleResellerSort('orderCount')}>
                        <div className="flex items-center justify-center gap-1">
                          <span>Total Orders</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                      <th className="p-3 text-right" onClick={() => toggleResellerSort('totalSales')}>
                        <div className="flex items-center justify-end gap-1">
                          <span>Total Sales</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                      <th className="p-3" onClick={() => toggleResellerSort('createdAt')}>
                        <div className="flex items-center gap-1">
                          <span>Join Date</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                      <th className="p-3" onClick={() => toggleResellerSort('status')}>
                        <div className="flex items-center gap-1">
                          <span>Status</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resellerReportList.map((r) => (
                      <tr key={r.uid} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-900">
                          <div>{r.fullName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{r.mobile}</div>
                        </td>
                        <td className="p-3 font-semibold text-blue-600">{r.shopName}</td>
                        <td className="p-3 text-center font-bold text-slate-800">{r.orderCount}</td>
                        <td className="p-3 text-right font-bold text-emerald-600">৳{r.totalSales.toLocaleString()}</td>
                        <td className="p-3 text-slate-500 font-mono text-[11px]">
                          {r.createdAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            r.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                            r.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: RESELLER FEEDBACK */}
          {activeTab === 'feedback' && (
            <AdminFeedbackList user={user} />
          )}
        </div>
      )}
    </div>
  );
};
