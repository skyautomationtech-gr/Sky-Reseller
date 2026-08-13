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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden max-w-2xl mx-auto my-2 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
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
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Success View */}
      {createdTicketId ? (
        <div className="p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner animate-bounce">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div>
            <h3 className="text-xl font-extrabold text-slate-900">Support Ticket Created!</h3>
            <p className="text-xs text-slate-500 mt-1">
              Your support request has been registered and assigned to our helpdesk team.
            </p>
          </div>

          {/* Ticket ID Box with Copy button */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl max-w-sm mx-auto flex items-center justify-between gap-3 shadow-inner">
            <div className="text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ticket ID</span>
              <span className="text-base font-mono font-extrabold text-slate-900">{createdTicketId}</span>
            </div>
            <button
              onClick={copyToClipboard}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy ID</span>
                </>
              )}
            </button>
          </div>

          {/* Response SLA Notice */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 max-w-md mx-auto flex items-center gap-3">
            <Clock className="w-5 h-5 text-blue-600 shrink-0" />
            <div className="text-left">
              <p className="font-bold">Estimated Response Time</p>
              <p className="text-[11px] text-blue-700 mt-0.5">
                You'll be contacted within <strong>{selectedPriorityConfig.hours} hours</strong> ({selectedPriorityConfig.label} priority). Confirmation and updates will be sent to <strong>{email}</strong>.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => {
                if (onCancel) onCancel();
              }}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-colors"
            >
              View My Support Tickets
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
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
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TicketCategory)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
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
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
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
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 resize-y"
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
              <select
                value={selectedOrderId}
                onChange={(e) => setSelectedOrderId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              >
                <option value="">-- No Specific Order Selected --</option>
                {userOrders.map((ord) => (
                  <option key={ord.id} value={ord.id}>
                    {ord.orderNumber || ord.id} ({ord.productName || 'Product'}) - ৳{ord.totalAmount}
                  </option>
                ))}
              </select>
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
                    className={`p-3.5 rounded-xl border-2 flex items-start gap-3 cursor-pointer transition-all ${pOpt.badgeBg} ${
                      isChecked ? `${pOpt.badgeBorder} ring-2 ring-blue-500/20` : 'border-slate-200 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="priority"
                      value={pOpt.value}
                      checked={isChecked}
                      onChange={() => setPriority(pOpt.value)}
                      className="mt-0.5 accent-blue-600 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className={`block text-xs font-extrabold ${pOpt.badgeText}`}>
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
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2.5 px-4 py-3 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 hover:border-blue-500 rounded-xl cursor-pointer text-xs text-slate-700 font-semibold transition-all">
                <Paperclip className="w-4 h-4 text-slate-500" />
                <span>Upload Screenshot or PDF (JPG, PNG, PDF up to 5MB)</span>
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
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              required
            />
            <p className="text-[11px] text-slate-400">Updates about this ticket will be sent to this email address.</p>
          </div>

          {/* Submit Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold text-xs rounded-xl transition-all shadow-md shadow-blue-600/20 flex items-center gap-2 cursor-pointer active:scale-98"
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
