import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, Notice, NoticeType, NoticeAudience } from '../../types';
import { logAuditAction } from '../../lib/auditLogger';
import { 
  Bell, Plus, Send, Trash2, Archive, Search, Tag, Users, AlertCircle, 
  CheckCircle2, Sparkles, Loader2, Megaphone, Calendar, Info
} from 'lucide-react';

interface NoticeManagerProps {
  user: UserProfile;
}

const TYPE_CONFIG: Record<NoticeType, { label: string; bg: string; text: string; border: string }> = {
  new_product: { label: 'New Product', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  offer: { label: 'Offer / Promotion', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  holiday_notice: { label: 'Holiday Notice', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  maintenance: { label: 'System Maintenance', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  payment_notice: { label: 'Payment Notice', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
};

export const NoticeManager: React.FC<NoticeManagerProps> = ({ user }) => {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [resellers, setResellers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form State
  const [noticeType, setNoticeType] = useState<NoticeType>('new_product');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetAudience, setTargetAudience] = useState<NoticeAudience>('all');
  const [selectedResellerId, setSelectedResellerId] = useState<string>('');
  const [resellerSearchTerm, setResellerSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [noticesSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'notices')),
        getDocs(collection(db, 'users')),
      ]);

      const nList: Notice[] = [];
      noticesSnap.forEach((d) => {
        nList.push(Object.assign({ id: d.id }, d.data()) as unknown as Notice);
      });
      // Sort newest first
      nList.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      const rList: UserProfile[] = [];
      usersSnap.forEach((d) => {
        const u = Object.assign({ uid: d.id }, d.data()) as unknown as UserProfile;
        if (u.role === 'reseller' && u.status === 'approved') {
          rList.push(u);
        }
      });

      setNotices(nList);
      setResellers(rList);
    } catch (err) {
      console.error('Error fetching notices:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePublishNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      setError('Please fill in notice title and message content.');
      return;
    }
    if (targetAudience === 'specific' && !selectedResellerId) {
      setError('Please select a specific reseller target.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      let targetName = null;
      if (targetAudience === 'specific') {
        const targetReseller = resellers.find((r) => r.uid === selectedResellerId);
        targetName = targetReseller ? targetReseller.fullName : 'Specific Reseller';
      }

      const newNotice = {
        type: noticeType,
        title: title.trim(),
        message: message.trim(),
        targetAudience,
        targetResellerId: targetAudience === 'specific' ? selectedResellerId : null,
        targetResellerName: targetName,
        publishedBy: user.uid,
        publishedByName: user.fullName,
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'notices'), newNotice);

      await logAuditAction(
        user.uid,
        user.fullName,
        user.role,
        'PUBLISH_NOTICE',
        docRef.id,
        `Published notice "${title.trim()}" (${TYPE_CONFIG[noticeType].label}) to ${targetAudience}`
      );

      setSuccess('Notice published successfully to resellers!');
      setTitle('');
      setMessage('');
      setTargetAudience('all');
      setSelectedResellerId('');
      setIsFormOpen(false);

      fetchData();
    } catch (err: any) {
      console.error('Error publishing notice:', err);
      setError('Failed to publish notice. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteNotice = async (noticeId: string, noticeTitle: string) => {
    if (!window.confirm(`Are you sure you want to delete notice "${noticeTitle}"?`)) return;

    try {
      await deleteDoc(doc(db, 'notices', noticeId));
      await logAuditAction(
        user.uid,
        user.fullName,
        user.role,
        'DELETE_NOTICE',
        noticeId,
        `Deleted notice "${noticeTitle}"`
      );
      setNotices((prev) => prev.filter((n) => n.id !== noticeId));
    } catch (err) {
      console.error('Error deleting notice:', err);
      alert('Failed to delete notice.');
    }
  };

  const filteredResellers = resellers.filter(
    (r) =>
      r.fullName.toLowerCase().includes(resellerSearchTerm.toLowerCase()) ||
      r.shopName.toLowerCase().includes(resellerSearchTerm.toLowerCase()) ||
      r.mobile.includes(resellerSearchTerm)
  );

  return (
    <div className="space-y-6">
      {/* Top Banner & Publish Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-blue-600/30">
            <Megaphone className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Notice Announcement Center</h2>
            <p className="text-xs text-slate-500 mt-0.5">Broadcast product offers, system alerts, and instructions to resellers.</p>
          </div>
        </div>

        <button
          onClick={() => setIsFormOpen(!isFormOpen)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-sm transition-all shrink-0"
        >
          {isFormOpen ? <Bell className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          <span>{isFormOpen ? 'Close Form' : 'Publish Notice'}</span>
        </button>
      </div>

      {/* Notice Form */}
      {isFormOpen && (
        <form onSubmit={handlePublishNotice} className="bg-white p-6 rounded-2xl border border-blue-200 shadow-md space-y-5 animate-in slide-in-from-top-2 duration-200">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>Compose New Announcement</span>
            </h3>
            <span className="text-xs text-slate-400">All fields required</span>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{success}</span>
            </div>
          )}

          {/* Notice Type Chip Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">Notice Category / Type:</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TYPE_CONFIG) as NoticeType[]).map((typeKey) => {
                const conf = TYPE_CONFIG[typeKey];
                const isSelected = noticeType === typeKey;
                return (
                  <button
                    key={typeKey}
                    type="button"
                    onClick={() => setNoticeType(typeKey)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : `${conf.bg} ${conf.text} ${conf.border} hover:opacity-80`
                    }`}
                  >
                    {conf.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title & Target Audience */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Notice Title</label>
              <input
                type="text"
                placeholder="e.g. Ramadan Special Discount on Smart Watches!"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Target Audience</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTargetAudience('all');
                    setSelectedResellerId('');
                  }}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border text-center transition-all ${
                    targetAudience === 'all'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  All Resellers
                </button>
                <button
                  type="button"
                  onClick={() => setTargetAudience('specific')}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border text-center transition-all ${
                    targetAudience === 'specific'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Specific Reseller
                </button>
              </div>
            </div>
          </div>

          {/* Specific Reseller Search Picker */}
          {targetAudience === 'specific' && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <label className="block text-xs font-bold text-slate-700">Select Target Reseller</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search reseller name, shop or phone..."
                  value={resellerSearchTerm}
                  onChange={(e) => setResellerSearchTerm(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 text-xs rounded-lg pl-9 pr-3 py-2 outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="max-h-40 overflow-y-auto space-y-1 pt-1">
                {filteredResellers.length === 0 ? (
                  <p className="text-xs text-slate-400 p-2 text-center">No matching resellers found.</p>
                ) : (
                  filteredResellers.map((r) => (
                    <div
                      key={r.uid}
                      onClick={() => setSelectedResellerId(r.uid)}
                      className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors ${
                        selectedResellerId === r.uid
                          ? 'bg-blue-600 text-white font-bold'
                          : 'hover:bg-slate-200 text-slate-800'
                      }`}
                    >
                      <div>
                        <span className="font-semibold">{r.fullName}</span>
                        <span className="opacity-75 text-[10px] ml-2">({r.shopName})</span>
                      </div>
                      <span className="font-mono text-[10px]">{r.mobile}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Message Textarea */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Notice Message Body</label>
            <textarea
              rows={4}
              placeholder="Write the detailed message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
              required
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>Broadcast Notice</span>
            </button>
          </div>
        </form>
      )}

      {/* Notice List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center justify-between">
          <span>Published Notices Archive ({notices.length})</span>
          <span className="text-slate-400 font-normal text-[11px]">Sorted newest first</span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <p className="text-xs font-medium">Loading published notices...</p>
          </div>
        ) : notices.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No notices published yet. Click "Publish Notice" above to announce updates.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notices.map((n) => {
              const conf = TYPE_CONFIG[n.type] || TYPE_CONFIG.new_product;
              const dateObj = n.createdAt?.toDate ? n.createdAt.toDate() : new Date(n.createdAt || 0);
              const formattedDate = dateObj.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div key={n.id} className="p-5 hover:bg-slate-50/70 transition-colors flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-2 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${conf.bg} ${conf.text} border ${conf.border}`}>
                        {conf.label}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        Audience: {n.targetAudience === 'all' ? 'All Resellers' : `Specific (${n.targetResellerName || 'Reseller'})`}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formattedDate}
                      </span>
                    </div>

                    <h4 className="font-bold text-slate-900 text-sm">{n.title}</h4>
                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line bg-slate-50 p-3 rounded-xl border border-slate-100">
                      {n.message}
                    </p>
                    <p className="text-[10px] text-slate-400">Published by: <span className="font-semibold text-slate-600">{n.publishedByName || 'Admin'}</span></p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleDeleteNotice(n.id, n.title)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-lg border border-rose-200 transition-colors"
                      title="Delete Notice"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
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
