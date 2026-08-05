import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, updateDoc, serverTimestamp, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, SupportTicket, TicketCategory, TicketStatus, TicketReply } from '../../types';
import { logAuditAction } from '../../lib/auditLogger';
import { 
  LifeBuoy, Plus, PhoneCall, MessageSquare, Send, CheckCircle2, 
  Clock, AlertCircle, Image as ImageIcon, X, ChevronRight, User, Shield, Loader2, ArrowLeft, ExternalLink
} from 'lucide-react';

interface SupportSystemProps {
  user: UserProfile;
}

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  order_issue: 'Order Issue',
  payment_issue: 'Payment Issue',
  product_issue: 'Product Issue',
  account_issue: 'Account Issue',
  other: 'Other Inquiry',
};

const STATUS_CONFIG: Record<TicketStatus, { label: string; bg: string; text: string }> = {
  open: { label: 'Open', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
  in_progress: { label: 'In Progress', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
  resolved: { label: 'Resolved', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  closed: { label: 'Closed', bg: 'bg-slate-100 border-slate-300', text: 'text-slate-600' },
};

export const SupportSystem: React.FC<SupportSystemProps> = ({ user }) => {
  const isStaff = user.role === 'super_admin' || user.role === 'admin';
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);

  // New Ticket Form State
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TicketCategory>('order_issue');
  const [description, setDescription] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // Realtime subscription for support tickets
    const q = collection(db, 'supportTickets');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: SupportTicket[] = [];
      snapshot.forEach((d) => {
        const ticket = Object.assign({ id: d.id }, d.data()) as unknown as SupportTicket;
        if (isStaff || ticket.resellerId === user.uid) {
          list.push(ticket);
        }
      });

      list.sort((a, b) => {
        const timeA = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setTickets(list);
      setLoading(false);

      // Keep selected ticket updated in realtime if viewing detail
      if (selectedTicket) {
        const updated = list.find((t) => t.id === selectedTicket.id);
        if (updated) setSelectedTicket(updated);
      }
    });

    return () => unsubscribe();
  }, [user.uid, isStaff]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('File size too large. Please upload an image under 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      setError('Please provide both subject and detailed description.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const newTicket = {
        resellerId: user.uid,
        resellerName: user.fullName,
        resellerShopName: user.shopName || '',
        subject: subject.trim(),
        category,
        description: description.trim(),
        imageUrl: imagePreview,
        status: 'open' as TicketStatus,
        replies: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'supportTickets'), newTicket);

      await logAuditAction(
        user.uid,
        user.fullName,
        user.role,
        'RAISE_SUPPORT_TICKET',
        docRef.id,
        `Raised ticket: "${subject.trim()}" (${CATEGORY_LABELS[category]})`
      );

      setSubject('');
      setDescription('');
      setImagePreview(null);
      setIsFormOpen(false);
    } catch (err) {
      console.error('Error creating support ticket:', err);
      setError('Failed to submit support ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;

    setReplySubmitting(true);
    try {
      const newReply: TicketReply = {
        id: Date.now().toString(),
        senderId: user.uid,
        senderName: user.fullName,
        senderRole: user.role,
        message: replyText.trim(),
        createdAt: new Date().toISOString(),
      };

      const updatedReplies = [...(selectedTicket.replies || []), newReply];

      const ticketRef = doc(db, 'supportTickets', selectedTicket.id);
      await updateDoc(ticketRef, {
        replies: updatedReplies,
        updatedAt: serverTimestamp(),
      });

      setReplyText('');
    } catch (err) {
      console.error('Error sending ticket reply:', err);
      alert('Failed to send reply.');
    } finally {
      setReplySubmitting(false);
    }
  };

  const handleUpdateStatus = async (ticketId: string, newStatus: TicketStatus) => {
    try {
      await updateDoc(doc(db, 'supportTickets', ticketId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      await logAuditAction(
        user.uid,
        user.fullName,
        user.role,
        'UPDATE_TICKET_STATUS',
        ticketId,
        `Updated support ticket status to ${newStatus}`
      );
    } catch (err) {
      console.error('Error updating ticket status:', err);
      alert('Failed to update ticket status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Contact Actions */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-blue-600/30">
              <LifeBuoy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Support & Help Desk</h2>
              <p className="text-xs text-slate-500 mt-0.5">Need help with orders, payments, or products? Get in touch with our team.</p>
            </div>
          </div>

          {!isStaff && (
            <button
              onClick={() => {
                setSelectedTicket(null);
                setIsFormOpen(!isFormOpen);
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-sm transition-all shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Raise Support Ticket</span>
            </button>
          )}
        </div>

        {/* Direct Contact Buttons */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Instant Contact:</span>
          <a
            href="https://wa.me/8801577351518"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition-all"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Chat on WhatsApp (+8801577351518)</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>
          <a
            href="tel:01577351518"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all"
          >
            <PhoneCall className="w-4 h-4 text-blue-400" />
            <span>Direct Call (01577351518)</span>
          </a>
        </div>
      </div>

      {/* Raise Ticket Form (Reseller) */}
      {isFormOpen && !isStaff && (
        <form onSubmit={handleCreateTicket} className="bg-white p-6 rounded-2xl border border-blue-200 shadow-md space-y-5 animate-in slide-in-from-top-2 duration-200">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <LifeBuoy className="w-4 h-4 text-blue-600" />
              <span>Create New Support Ticket</span>
            </h3>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {error}
            </div>
          )}

          {/* Category Chip Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">Category:</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CATEGORY_LABELS) as TicketCategory[]).map((catKey) => {
                const isSelected = category === catKey;
                return (
                  <button
                    key={catKey}
                    type="button"
                    onClick={() => setCategory(catKey)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {CATEGORY_LABELS[catKey]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Subject / Issue Summary</label>
            <input
              type="text"
              placeholder="e.g. Payment not credited for Order #SR-1002"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
              required
            />
          </div>

          {/* Detailed Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Detailed Description</label>
            <textarea
              rows={4}
              placeholder="Explain what happened in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
              required
            />
          </div>

          {/* Optional Image Attachment */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Optional Screenshot / Attachment</label>
            {imagePreview ? (
              <div className="relative inline-block border rounded-xl overflow-hidden">
                <img src={imagePreview} alt="Preview" className="h-28 object-cover" />
                <button
                  type="button"
                  onClick={() => setImagePreview(null)}
                  className="absolute top-1 right-1 bg-slate-900/80 text-white p-1 rounded-full hover:bg-slate-900"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 rounded-xl cursor-pointer text-xs text-slate-600 font-semibold w-fit">
                <ImageIcon className="w-4 h-4 text-slate-500" />
                <span>Upload Screenshot</span>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            )}
          </div>

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
              <span>Submit Ticket</span>
            </button>
          </div>
        </form>
      )}

      {/* Main Grid: Ticket List & Detail View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Ticket List Column */}
        <div className={`space-y-4 ${selectedTicket ? 'lg:col-span-5 hidden lg:block' : 'lg:col-span-12'}`}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center justify-between">
              <span>{isStaff ? 'All Support Tickets' : 'My Support Tickets'} ({tickets.length})</span>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <p className="text-xs font-medium">Loading support tickets...</p>
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                No support tickets found. Click "Raise Support Ticket" to create one.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {tickets.map((t) => {
                  const statusConf = STATUS_CONFIG[t.status] || STATUS_CONFIG.open;
                  const isSelected = selectedTicket?.id === t.id;
                  const dateObj = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt || 0);

                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTicket(t)}
                      className={`p-4 transition-all cursor-pointer ${
                        isSelected ? 'bg-blue-50/80 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase ${statusConf.bg} ${statusConf.text}`}>
                          {statusConf.label}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {dateObj.toLocaleDateString('en-GB')}
                        </span>
                      </div>

                      <h4 className="font-bold text-slate-900 text-xs line-clamp-1">{t.subject}</h4>
                      
                      {isStaff && (
                        <p className="text-[11px] font-semibold text-blue-600 mt-1">
                          Reseller: {t.resellerName} ({t.resellerShopName})
                        </p>
                      )}

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                        <span>{CATEGORY_LABELS[t.category]}</span>
                        <span className="font-semibold text-slate-700">
                          {t.replies?.length || 0} replies
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Ticket Detail & Reply Thread View Column */}
        {selectedTicket && (
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full min-h-[500px]">
              {/* Header */}
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedTicket(null)}
                    className="p-1 text-slate-400 hover:text-white lg:hidden"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h3 className="font-bold text-sm text-white line-clamp-1">{selectedTicket.subject}</h3>
                    <p className="text-[10px] text-slate-400">
                      Category: {CATEGORY_LABELS[selectedTicket.category]} | Ticket ID: {selectedTicket.id.slice(0, 8)}
                    </p>
                  </div>
                </div>

                {/* Staff Status Changer */}
                {isStaff ? (
                  <select
                    value={selectedTicket.status}
                    onChange={(e) => handleUpdateStatus(selectedTicket.id, e.target.value as TicketStatus)}
                    className="bg-slate-800 text-white text-xs border border-slate-700 rounded-lg px-2.5 py-1.5 outline-none font-bold"
                  >
                    <option value="open">Status: Open</option>
                    <option value="in_progress">Status: In Progress</option>
                    <option value="resolved">Status: Resolved</option>
                    <option value="closed">Status: Closed</option>
                  </select>
                ) : (
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${STATUS_CONFIG[selectedTicket.status].bg} ${STATUS_CONFIG[selectedTicket.status].text}`}>
                    {STATUS_CONFIG[selectedTicket.status].label}
                  </span>
                )}
              </div>

              {/* Ticket Body & Thread */}
              <div className="p-6 flex-1 overflow-y-auto space-y-4 bg-slate-50/50">
                {/* Original Message Card */}
                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-blue-600" />
                      <span>{selectedTicket.resellerName} ({selectedTicket.resellerShopName})</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Original Ticket</span>
                  </div>
                  <p className="text-xs text-slate-800 whitespace-pre-line leading-relaxed">
                    {selectedTicket.description}
                  </p>
                  {selectedTicket.imageUrl && (
                    <div className="pt-2">
                      <a href={selectedTicket.imageUrl} target="_blank" rel="noopener noreferrer">
                        <img src={selectedTicket.imageUrl} alt="Attachment" className="max-h-48 rounded-lg border border-slate-200 object-cover" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Reply Thread */}
                {selectedTicket.replies && selectedTicket.replies.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Conversation History</h5>
                    {selectedTicket.replies.map((reply) => {
                      const isSelf = reply.senderId === user.uid;
                      const isStaffReply = reply.senderRole === 'super_admin' || reply.senderRole === 'admin';

                      return (
                        <div
                          key={reply.id}
                          className={`p-3.5 rounded-2xl max-w-[85%] text-xs space-y-1 ${
                            isSelf
                              ? 'ml-auto bg-blue-600 text-white rounded-br-xs'
                              : isStaffReply
                              ? 'bg-slate-900 text-white rounded-bl-xs'
                              : 'bg-white text-slate-800 border border-slate-200 shadow-2xs rounded-bl-xs'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4 text-[10px] opacity-80 border-b border-white/10 pb-1 mb-1">
                            <span className="font-bold flex items-center gap-1">
                              {isStaffReply && <Shield className="w-3 h-3 text-amber-400" />}
                              <span>{reply.senderName}</span>
                            </span>
                            <span className="font-mono">
                              {new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="whitespace-pre-line leading-relaxed">{reply.message}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Reply Input */}
              {selectedTicket.status !== 'closed' ? (
                <div className="p-4 bg-white border-t border-slate-200 space-y-2">
                  <div className="flex gap-2">
                    <textarea
                      rows={2}
                      placeholder="Type a reply..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                    />
                    <button
                      onClick={handleSendReply}
                      disabled={replySubmitting || !replyText.trim()}
                      className="px-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-all"
                    >
                      {replySubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-100 border-t border-slate-200 text-center text-xs text-slate-500 font-medium">
                  This support ticket is closed. Re-open by changing status if staff.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
