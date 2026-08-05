import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { CommissionSettings, UserProfile, WalletTransaction } from '../../types';
import { Percent, Award, ArrowDownLeft, Calendar, Loader2, Sparkles, CheckCircle2, ShoppingBag } from 'lucide-react';

interface CommissionSummaryProps {
  user: UserProfile;
}

export const CommissionSummary: React.FC<CommissionSummaryProps> = ({ user }) => {
  const [commissionTxs, setCommissionTxs] = useState<WalletTransaction[]>([]);
  const [thisMonthDeliveredCount, setThisMonthDeliveredCount] = useState<number>(0);
  const [settings, setSettings] = useState<CommissionSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCommissionData();
  }, [user.uid]);

  const fetchCommissionData = async () => {
    setLoading(true);
    try {
      // 1. Fetch active settings for monthly bonus threshold
      const setSnap = await getDoc(doc(db, 'commissionSettings', 'global'));
      if (setSnap.exists()) {
        setSettings(setSnap.data() as CommissionSettings);
      }

      // 2. Fetch commission transactions
      const txQuery = query(
        collection(db, 'transactions'),
        where('resellerId', '==', user.uid),
        where('type', '==', 'commission')
      );
      const txSnap = await getDocs(txQuery);
      const list: WalletTransaction[] = [];
      txSnap.forEach((d) => list.push(Object.assign({ id: d.id }, d.data()) as unknown as WalletTransaction));

      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setCommissionTxs(list);

      // 3. Count delivered orders this month for user
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const ordersQuery = query(
        collection(db, 'orders'),
        where('resellerId', '==', user.uid),
        where('status', '==', 'delivered')
      );
      const ordersSnap = await getDocs(ordersQuery);
      let countThisMonth = 0;
      ordersSnap.forEach((d) => {
        const oData = d.data();
        const createdDate = oData.createdAt?.toDate ? oData.createdAt.toDate() : new Date(oData.createdAt || 0);
        if (createdDate >= startOfMonth) {
          countThisMonth++;
        }
      });

      setThisMonthDeliveredCount(countThisMonth);
    } catch (err) {
      console.error('Error fetching commission summary:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2 bg-white rounded-2xl border border-slate-200">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        <span>Loading commission metrics...</span>
      </div>
    );
  }

  // Calculate earnings
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const thisMonthEarnings = commissionTxs
    .filter((tx) => {
      const d = tx.createdAt?.toDate ? tx.createdAt.toDate() : new Date(tx.createdAt || 0);
      return d >= startOfMonth && tx.status === 'approved';
    })
    .reduce((sum, tx) => sum + tx.amount, 0);

  const lifetimeEarnings = commissionTxs
    .filter((tx) => tx.status === 'approved')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const targetOrders = settings?.monthlyBonusThresholdOrders || 50;
  const bonusReward = settings?.monthlyBonusAmount || 1000;
  const progressPct = Math.min(100, Math.round((thisMonthDeliveredCount / targetOrders) * 100));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Percent className="w-6 h-6 text-blue-600" />
          <span>My Commission & Earnings Hub</span>
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Track completed order payouts, monthly performance targets, and bonus reward milestones
        </p>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              This Month's Earnings
            </span>
            <span className="text-2xl font-extrabold text-emerald-600">৳{thisMonthEarnings.toLocaleString()}</span>
          </div>
          <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Lifetime Earnings
            </span>
            <span className="text-2xl font-extrabold text-blue-600">৳{lifetimeEarnings.toLocaleString()}</span>
          </div>
          <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Delivered Orders This Month
            </span>
            <span className="text-2xl font-extrabold text-slate-900">{thisMonthDeliveredCount}</span>
          </div>
          <div className="w-11 h-11 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Monthly Bonus Progress Box */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center border border-amber-500/30">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Monthly Sales Target Bonus</h3>
              <p className="text-[11px] text-slate-300">Deliver {targetOrders} orders this month to earn ৳{bonusReward.toLocaleString()} cash bonus!</p>
            </div>
          </div>
          <span className="bg-amber-400/20 text-amber-300 text-xs font-bold px-3 py-1 rounded-full border border-amber-400/30">
            ৳{bonusReward.toLocaleString()} Reward
          </span>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-300">{thisMonthDeliveredCount} of {targetOrders} delivered orders</span>
            <span className="text-amber-400 font-bold">{progressPct}% Completed</span>
          </div>
          <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden p-0.5 border border-slate-700">
            <div
              className="bg-gradient-to-r from-amber-400 to-emerald-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Recent Earnings Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
          <span>Commission Earnings Log</span>
        </h3>

        {commissionTxs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
            No commission earnings recorded yet. Earn commission when your orders reach "Delivered" status.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="px-4 py-3">Order Number</th>
                  <th className="px-4 py-3 text-right">Commission Earned</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {commissionTxs.map((tx) => {
                  const dateStr = tx.createdAt?.toDate
                    ? tx.createdAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    : 'N/A';

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                          {tx.orderNumber || 'ORD-REF'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-extrabold text-emerald-600 text-sm">
                        +৳{tx.amount}
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full capitalize">
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-medium">
                        {dateStr}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
