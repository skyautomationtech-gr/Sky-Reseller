import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, Order, SupportTicket, TicketCategory, TicketPriority } from '../../types';
import { logAuditAction } from '../../lib/auditLogger';
import { 
  LifeBuoy, Send, CheckCircle2, AlertCircle, Loader2, Copy, Check, Paperclip, X, Image as ImageIcon, FileText, Clock
} from 'lucide-react';

interface SupportTicketFormProps {
  user: UserProfile;
  onSuccess?: (ticketId: string) => void;
  onCancel?: () => void;
}

const CATEGORY_OPTIONS: { value: TicketCategory; label: string }[] = [
  { value: 'Order Issue', label: 'Order Issue' },
  { value: 'Payment Issue', label: 'Payment Issue' },
  { value: 'Product Quality Issue', label: 'Product Quality Issue' },
  { value: 'Account Issue', label: 'Account Issue' },
  { value: 'Delivery Problem', label: 'Delivery Problem' },
  { value: 'Commission Question', label: 'Commission Question' },
  { value: 'App Bug/Technical', label: 'App Bug/Technical' },
  { value: 'Other', label: 'Other' },
];

const PRIORITY_OPTIONS: { 
  value: TicketPriority; 
  label: string; 
  timeframe: string; 
  hours: number;
  badgeBg: string; 
  badgeText: string;
  badgeBorder: string;
}[] = [
  { 
    value: 'low', 
    label: 'Low', 
    timeframe: 'respond in 24 hours', 
    hours: 24,
    badgeBg: 'bg-emerald-50 hover:bg-emerald-100/80', 
    badgeText: 'text-emerald-700',
    badgeBorder: 'border-emerald-300'
  },
  { 
    value: 'medium', 
    label: 'Medium', 
    timeframe: 'respond in 12 hours', 
    hours: 12,
    badgeBg: 'bg-amber-50 hover:bg-amber-100/80', 
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-300'
  },
  { 
    value: 'high', 
    label: 'High', 
    timeframe: 'respond in 4 hours', 
    hours: 4,
    badgeBg: 'bg-rose-50 hover:bg-rose-100/80', 
    badgeText: 'text-rose-700',
    badgeBorder: 'border-rose-300'
  },
];

export const SupportTicketForm: React.FC<SupportTicketFormProps> = ({
  user,
  onSuccess,
  onCancel,
}) => {
  // User orders for dropdown
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Form Fields
  const [category, setCategory] = useState<TicketCategory | ''>('Order Issue');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string>('');
  const [attachmentType, setAttachmentType] = useState<string>('');
  const [email, setEmail] = useState<string>(user.email || '');

  // Status & Success state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, [user.uid]);

  const fetchOrders = async () => {
    setLoadingOrders(true);
    try {
      const q = query(collection(db, 'orders'), where('resellerId', '==', user.uid));
      const snap = await getDocs(q);
      const list: Order[] = [];
      snap.forEach((docSnap) => {
        list.push(Object.assign({ id: docSnap.id }, docSnap.data()) as unknown as Order);
      });

      // Sort newest first
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setUserOrders(list);
    } catch (err) {
      console.error('Error fetching reseller orders for ticket form:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size max 5MB
    if (file.size > 5 * 1024 * 1024) {
      setError('File size exceeds 5MB limit. Please attach a smaller file.');
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setError('Allowed formats: JPG, PNG, PDF.');
      return;
    }

    setError('');
    setAttachmentName(file.name);
    setAttachmentType(file.type);

    const reader = new FileReader();
    reader.onload = (evt) => {
      setAttachmentPreview(evt.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Form Validations
    if (!category) {
      setError('Please select an issue category.');
      return;
    }

    if (!subject.trim()) {
      setError('Please enter a subject / title for your issue.');
      return;
    }

    if (subject.trim().length > 100) {
      setError('Subject cannot exceed 100 characters.');
      return;
    }

    if (!description.trim()) {
      setError('Please provide a detailed description of your issue.');
      return;
    }

    if (description.trim().length > 1000) {
      setError('Description cannot exceed 1000 characters.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid contact email address.');
      return;
    }

    setSubmitting(true);

    try {
      // Auto-generate ticket ID format: TICKET-XXXXXX
      const randomNum = Math.floor(100000 + Math.random() * 900000);
      const generatedTicketId = `TICKET-${randomNum}`;

      const selectedOrder = userOrders.find((o) => o.id === selectedOrderId);

      const ticketPayload: Omit<SupportTicket, 'id'> = {
        ticketId: generatedTicketId,
        resellerId: user.uid,
        resellerName: user.fullName || user.email || 'Reseller',
        resellerShopName: user.shopName || '',
        category,
        subject: subject.trim(),
        description: description.trim(),
        orderId: selectedOrderId || null,
        orderNumber: selectedOrder ? (selectedOrder.orderNumber || selectedOrder.id) : null,
        priority,
        attachmentUrl: attachmentPreview || null,
        email: email.trim(),
        status: 'open',
        replies: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'supportTickets'), ticketPayload);

      // Audit log
      await logAuditAction(
        user.uid,
        user.fullName,
        user.role,
        'RAISE_SUPPORT_TICKET',
        docRef.id,
        `Submitted support ticket ${generatedTicketId}: "${subject.trim()}"`
      );

      // Send admin notice in Firestore
      try {
        await addDoc(collection(db, 'notices'), {
          type: 'maintenance',
          title: `New Support Ticket [${generatedTicketId}] (${priority.toUpperCase()})`,
          message: `${user.fullName} (${user.shopName || 'Reseller'}) raised ticket: "${subject.trim()}". Category: ${category}. Priority: ${priority}`,
          targetAudience: 'all',
          publishedBy: user.uid,
          publishedByName: user.fullName,
          createdAt: serverTimestamp(),
        });
      } catch (nErr) {
        console.warn('Notice creation error:', nErr);
      }

      setCreatedTicketId(generatedTicketId);

      if (onSuccess) {
        onSuccess(generatedTicketId);
      }
    } catch (err: any) {
      console.error('Error submitting support ticket:', err);
      setError(err?.message || 'Failed to submit support ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = () => {
    if (!createdTicketId) return;
    navigator.clipboard.writeText(createdTicketId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const selectedPriorityConfig = PRIORITY_OPTIONS.find((p) => p.value === priority) || PRIORITY_OPTIONS[1];

  return (
    <div className="fixed sm:relative inset-0 sm:inset-auto z-50 sm:z-auto w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-2xl bg-white sm:rounded-2xl border-0 sm:border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in fade-in sm:zoom-in-95 duration-200">
      {/* Top Banner - Sticky */}
      <div className="sticky top-0 z-20 bg-slate-900 text-white px-4 sm:px-6 py-4 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md shadow-blue-600/30">
            <LifeBuoy className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white">Create Support Ticket</h2>
            <p className="text-[11px] text-slate-400">Report an issue or ask a question to our team</p>
          </div>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Success View */}
      {createdTicketId ? (
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 flex flex-col justify-center items-center text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner animate-bounce shrink-0">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div>
            <h3 className="text-xl font-extrabold text-slate-900">Support Ticket Created!</h3>
            <p className="text-xs text-slate-500 mt-1">
              Your support request has been registered and assigned to our helpdesk team.
            </p>
          </div>

          {/* Ticket ID Box with Copy button */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl w-full max-w-sm mx-auto flex items-center justify-between gap-3 shadow-inner">
            <div className="text-left min-w-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ticket ID</span>
              <span className="font-mono text-xs font-bold text-slate-800 truncate block">
                {createdTicketId}
              </span>
            </div>
            <button
              onClick={copyToClipboard}
              className={`p-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 min-h-[44px] min-w-[44px] transition-all cursor-pointer ${
                copied
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="hidden sm:inline">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span className="hidden sm:inline">Copy ID</span>
                </>
              )}
            </button>
          </div>

          {/* Response SLA Notice */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 w-full max-w-md mx-auto flex items-start gap-3">
            <Clock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-left min-w-0">
              <p className="font-bold">Estimated Response Time</p>
              <p className="text-[11px] text-blue-700 mt-0.5 leading-relaxed">
                You'll be contacted within <strong>{selectedPriorityConfig.hours} hours</strong> ({selectedPriorityConfig.label} priority). Confirmation and updates will be sent to <span className="font-semibold break-all">{email}</span>.
              </p>
            </div>
          </div>

          <div className="pt-2 w-full max-w-xs">
            <button
              onClick={() => {
                if (onCancel) onCancel();
              }}
              className="w-full px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm rounded-xl shadow-md transition-colors min-h-[44px] flex items-center justify-center"
            >
              View My Support Tickets
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {error && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            {/* 1. Issue Category */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Issue Category <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TicketCategory)}
                  className="w-full h-11 sm:h-10 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer appearance-none"
                  required
                >
                  <option value="" disabled>-- Select Issue Category --</option>
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 2. Subject / Title */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Subject / Title <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  {subject.length}/100
                </span>
              </div>
              <input
                type="text"
                maxLength={100}
                placeholder="Brief summary of issue"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full h-11 sm:h-10 px-4 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                required
              />
            </div>

            {/* 3. Description */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Description <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  {description.length}/1000
                </span>
              </div>
              <textarea
                rows={4}
                maxLength={1000}
                placeholder="Describe your issue in detail..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full min-h-[110px] px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 resize-y"
                required
              />
            </div>

            {/* 4. Related Order ID (dropdown, optional) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Related Order ID <span className="text-slate-400 font-normal">(Optional)</span>
              </label>

              {loadingOrders ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span>Loading your orders...</span>
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={selectedOrderId}
                    onChange={(e) => setSelectedOrderId(e.target.value)}
                    className="w-full h-11 sm:h-10 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer appearance-none"
                  >
                    <option value="">-- No Specific Order Selected --</option>
                    {userOrders.map((ord) => (
                      <option key={ord.id} value={ord.id}>
                        {ord.orderNumber || ord.id} ({ord.productName || 'Product'}) - ৳{ord.totalAmount}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="text-[11px] text-slate-400">Select an order if this ticket relates to a specific purchase or delivery.</p>
            </div>

            {/* 5. Priority Radio Buttons */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Priority Level <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {PRIORITY_OPTIONS.map((pOpt) => {
                  const isChecked = priority === pOpt.value;
                  return (
                    <label
                      key={pOpt.value}
                      className={`p-3.5 min-h-[56px] rounded-xl border-2 flex items-center gap-3 cursor-pointer transition-all ${pOpt.badgeBg} ${
                        isChecked ? `${pOpt.badgeBorder} ring-2 ring-blue-500/20 shadow-sm` : 'border-slate-200 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <input
                        type="radio"
                        name="priority"
                        value={pOpt.value}
                        checked={isChecked}
                        onChange={() => setPriority(pOpt.value)}
                        className="accent-blue-600 w-5 h-5 cursor-pointer shrink-0"
                      />
                      <div className="min-w-0">
                        <span className={`block text-xs font-extrabold ${pOpt.badgeText} truncate`}>
                          {pOpt.label}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
                          ({pOpt.timeframe})
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 6. Attachment (Optional) */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Attachment / Evidence <span className="text-slate-400 font-normal">(Optional, max 5MB)</span>
              </label>

              {attachmentPreview ? (
                <div className="p-3 bg-slate-50 border border-slate-300 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    {attachmentType.includes('image') ? (
                      <img src={attachmentPreview} alt="Preview" className="w-10 h-10 object-cover rounded-lg border border-slate-200 shrink-0" />
                    ) : (
                      <div className="w-10 h-10 bg-slate-200 text-slate-600 rounded-lg flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                    )}
                    <span className="text-xs font-bold text-slate-800 truncate">{attachmentName || 'Attachment'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentPreview(null);
                      setAttachmentName('');
                      setAttachmentType('');
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/50 rounded-xl cursor-pointer transition-all min-h-[110px]">
                  <Paperclip className="w-8 h-8 text-blue-600 mb-2" />
                  <span className="text-sm font-extrabold text-slate-800 text-center">Tap to upload attachment</span>
                  <span className="text-[11px] text-slate-500 text-center mt-0.5">JPG, PNG or PDF up to 5MB</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/jpg,application/pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {/* 7. Contact Email (pre-filled, user can edit) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Contact Email <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 sm:h-10 px-4 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                required
              />
              <p className="text-[11px] text-slate-400">Updates about this ticket will be sent to this email address.</p>
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="sticky bottom-0 z-20 bg-slate-50 px-4 sm:px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                className="px-5 py-3 sm:py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm sm:text-xs rounded-xl transition-colors min-h-[44px] sm:min-h-[38px] flex items-center justify-center"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 sm:py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold text-sm sm:text-xs rounded-xl transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 cursor-pointer active:scale-98 min-h-[44px] sm:min-h-[38px]"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Submitting Ticket...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Submit Ticket</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
