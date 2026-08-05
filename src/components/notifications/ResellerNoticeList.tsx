import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, Notice, NoticeType } from '../../types';
import { Bell, CheckCircle2, Megaphone, Loader2, Calendar, Tag } from 'lucide-react';

interface ResellerNoticeListProps {
  user: UserProfile;
}

const TYPE_CONFIG: Record<NoticeType, { label: string; bg: string; text: string; border: string }> = {
  new_product: { label: 'New Product', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  offer: { label: 'Offer / Promotion', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  holiday_notice: { label: 'Holiday Notice', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  maintenance: { label: 'System Maintenance', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  payment_notice: { label: 'Payment Notice', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
};

export const ResellerNoticeList: React.FC<ResellerNoticeListProps> = ({ user }) => {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [readNoticeIds, setReadNoticeIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNoticesAndReads();
  }, [user.uid]);

  const fetchNoticesAndReads = async () => {
    setLoading(true);
    try {
      const [noticesSnap, readsSnap] = await Promise.all([
        getDocs(collection(db, 'notices')),
        getDocs(collection(db, 'noticeReads')),
      ]);

      const reads = new Set<string>();
      readsSnap.forEach((d) => {
        const data = d.data();
        if (data.resellerId === user.uid) {
          reads.add(data.noticeId);
        }
      });
      setReadNoticeIds(reads);

      const nList: Notice[] = [];
      noticesSnap.forEach((d) => {
        const n = Object.assign({ id: d.id }, d.data()) as unknown as Notice;
        if (n.targetAudience === 'all' || n.targetResellerId === user.uid) {
          nList.push(n);
        }
      });

      nList.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setNotices(nList);
    } catch (err) {
      console.error('Error fetching reseller notices:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (noticeId: string) => {
    if (readNoticeIds.has(noticeId)) return;

    try {
      const readDocId = `${user.uid}_${noticeId}`;
      await setDoc(doc(db, 'noticeReads', readDocId), {
        noticeId,
        resellerId: user.uid,
        readAt: serverTimestamp(),
      });

      setReadNoticeIds((prev) => new Set(prev).add(noticeId));
    } catch (err) {
      console.error('Error marking notice as read:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex items-center justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-blue-600/30">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Notifications & Announcements</h2>
            <p className="text-xs text-slate-500 mt-0.5">Stay updated with official offers, product drops, and sky automation updates.</p>
          </div>
        </div>
      </div>

      {/* Notice Feed */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center justify-between">
          <span>Notice Board ({notices.length})</span>
          <span className="text-slate-400 font-normal text-[11px]">Click a notice to mark as read</span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <p className="text-xs font-medium">Loading notifications...</p>
          </div>
        ) : notices.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No notices or announcements at this time.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notices.map((n) => {
              const conf = TYPE_CONFIG[n.type] || TYPE_CONFIG.new_product;
              const isRead = readNoticeIds.has(n.id);
              const dateObj = n.createdAt?.toDate ? n.createdAt.toDate() : new Date(n.createdAt || 0);
              const formattedDate = dateObj.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={n.id}
                  onClick={() => markAsRead(n.id)}
                  className={`p-5 transition-all cursor-pointer ${
                    isRead ? 'bg-white hover:bg-slate-50' : 'bg-blue-50/40 hover:bg-blue-50/70 border-l-4 border-blue-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${conf.bg} ${conf.text} border ${conf.border}`}>
                          {conf.label}
                        </span>
                        {!isRead && (
                          <span className="px-2 py-0.5 bg-blue-600 text-white rounded-full text-[9px] font-black uppercase tracking-wider">
                            NEW
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono ml-auto">
                          {formattedDate}
                        </span>
                      </div>

                      <h4 className="font-bold text-slate-900 text-sm">{n.title}</h4>
                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
                        {n.message}
                      </p>
                    </div>

                    <div className="pt-1">
                      {isRead ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" title="Read" />
                      ) : (
                        <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" title="Unread" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
