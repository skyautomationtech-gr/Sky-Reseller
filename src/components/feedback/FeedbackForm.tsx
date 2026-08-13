import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, FeedbackType, BugSeverity, ResellerFeedback } from '../../types';
import { logAuditAction } from '../../lib/auditLogger';
import { 
  MessageSquare, Send, CheckCircle2, AlertCircle, Loader2, Copy, Check, Paperclip, X, Image as ImageIcon,
  AlertTriangle, Lightbulb, Bug, Sparkles, Clock, FileText
} from 'lucide-react';

interface FeedbackFormProps {
  user: UserProfile;
  onSuccess?: (refId: string) => void;
  onCancel?: () => void;
}

const TYPE_CONFIG: Record<FeedbackType, {
  label: string;
  icon: React.ElementType;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  activeRing: string;
  categories: string[];
}> = {
  'Complaint': {
    label: 'Complaint',
    icon: AlertTriangle,
    badgeBg: 'bg-rose-50 hover:bg-rose-100/80',
    badgeBorder: 'border-rose-300',
    badgeText: 'text-rose-700',
    activeRing: 'ring-2 ring-rose-500/30 border-rose-500',
    categories: [
      'Product Quality',
      'Customer Service',
      'Delivery',
      'Payment Issue',
      'App Performance',
    ],
  },
  'Suggestion/Feedback': {
    label: 'Suggestion/Feedback',
    icon: Lightbulb,
    badgeBg: 'bg-blue-50 hover:bg-blue-100/80',
    badgeBorder: 'border-blue-300',
    badgeText: 'text-blue-700',
    activeRing: 'ring-2 ring-blue-500/30 border-blue-500',
    categories: [
      'Feature Request',
      'UI/UX Improvement',
      'Performance',
      'Other',
    ],
  },
  'Bug Report': {
    label: 'Bug Report',
    icon: Bug,
    badgeBg: 'bg-amber-50 hover:bg-amber-100/80',
    badgeBorder: 'border-amber-300',
    badgeText: 'text-amber-800',
    activeRing: 'ring-2 ring-amber-500/30 border-amber-500',
    categories: [
      'App Crash',
      'Feature Not Working',
      'Data Loss',
      'Performance Issue',
    ],
  },
  'Feature Request': {
    label: 'Feature Request',
    icon: Sparkles,
    badgeBg: 'bg-emerald-50 hover:bg-emerald-100/80',
    badgeBorder: 'border-emerald-300',
    badgeText: 'text-emerald-700',
    activeRing: 'ring-2 ring-emerald-500/30 border-emerald-500',
    categories: [
      'Dashboard',
      'Product Management',
      'Orders',
      'Wallet',
      'Reports',
      'Other',
    ],
  },
};

const SEVERITY_OPTIONS: BugSeverity[] = ['Critical', 'High', 'Medium', 'Low'];

export const FeedbackForm: React.FC<FeedbackFormProps> = ({
  user,
  onSuccess,
  onCancel,
}) => {
  const [type, setType] = useState<FeedbackType>('Complaint');
  const [category, setCategory] = useState<string>('Product Quality');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<BugSeverity>('Medium');
  const [email, setEmail] = useState(user.email || '');

  // Screenshots state (max 3)
  const [images, setImages] = useState<{ name: string; url: string }[]>([]);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submittedRefId, setSubmittedRefId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // When type changes, default category to first in array
  const handleTypeChange = (newType: FeedbackType) => {
    setType(newType);
    setCategory(TYPE_CONFIG[newType].categories[0] || '');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (images.length + files.length > 3) {
      setError('You can attach a maximum of 3 screenshots/evidence images.');
      return;
    }

    setError('');
    const fileList: File[] = Array.from(files);
    fileList.forEach((file: File) => {
      if (file.size > 5 * 1024 * 1024) {
        setError(`File "${file.name}" exceeds the 5MB size limit.`);
        return;
      }

      if (!file.type.startsWith('image/')) {
        setError(`File "${file.name}" is not a supported image format.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) {
          setImages((prev) => [
            ...prev.slice(0, 2), // ensure max 3
            { name: file.name, url: evt.target!.result as string },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Please provide a title for your feedback/complaint.');
      return;
    }

    if (title.trim().length > 100) {
      setError('Title cannot exceed 100 characters.');
      return;
    }

    if (!message.trim()) {
      setError('Please enter a detailed message explaining your complaint or feedback.');
      return;
    }

    if (message.trim().length > 1000) {
      setError('Message cannot exceed 1000 characters.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);

    try {
      // Auto-generate reference number e.g. FB-938210
      const randNum = Math.floor(100000 + Math.random() * 900000);
      const generatedRefId = `FB-${randNum}`;

      const feedbackPayload: Omit<ResellerFeedback, 'id'> = {
        refId: generatedRefId,
        resellerId: user.uid,
        resellerName: user.fullName || user.email || 'Reseller',
        resellerShopName: user.shopName || '',
        type,
        category,
        title: title.trim(),
        message: message.trim(),
        attachmentUrls: images.map((img) => img.url),
        severity: type === 'Bug Report' ? severity : null,
        status: 'new',
        email: email.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'feedback'), feedbackPayload);

      // Audit log
      await logAuditAction(
        user.uid,
        user.fullName,
        user.role,
        'SUBMIT_FEEDBACK',
        docRef.id,
        `Submitted ${type} (${generatedRefId}): "${title.trim()}"`
      );

      // Send admin notice
      try {
        await addDoc(collection(db, 'notices'), {
          type: 'announcement',
          title: `New Reseller ${type} [${generatedRefId}]`,
          message: `${user.fullName} submitted a ${type} (${category}): "${title.trim()}".`,
          targetAudience: 'all',
          publishedBy: user.uid,
          publishedByName: user.fullName,
          createdAt: serverTimestamp(),
        });
      } catch (nErr) {
        console.warn('Notice notification error:', nErr);
      }

      setSubmittedRefId(generatedRefId);

      if (onSuccess) {
        onSuccess(generatedRefId);
      }
    } catch (err: any) {
      console.error('Error submitting feedback:', err);
      setError(err?.message || 'Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyRefToClipboard = () => {
    if (!submittedRefId) return;
    navigator.clipboard.writeText(submittedRefId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden max-w-2xl mx-auto my-2 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md shadow-indigo-600/30">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white">Complaint & Feedback Form</h2>
            <p className="text-[11px] text-slate-400">Share complaints, suggestions, or report technical bugs</p>
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
      {submittedRefId ? (
        <div className="p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner animate-bounce">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div>
            <h3 className="text-xl font-extrabold text-slate-900">Thank You for Your Submission!</h3>
            <p className="text-xs text-slate-500 mt-1">
              Your feedback has been logged successfully and routed to our administration team for review.
            </p>
          </div>

          {/* Reference ID Box */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl max-w-sm mx-auto flex items-center justify-between gap-3 shadow-inner">
            <div className="text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Reference Number</span>
              <span className="text-base font-mono font-extrabold text-slate-900">{submittedRefId}</span>
            </div>
            <button
              onClick={copyRefToClipboard}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Ref</span>
                </>
              )}
            </button>
          </div>

          <p className="text-xs text-slate-500">
            A confirmation has been prepared for <strong>{email}</strong>. Our team will examine your submission promptly.
          </p>

          <div className="pt-2">
            <button
              onClick={() => {
                if (onCancel) onCancel();
              }}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
            >
              Done
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

          {/* 1. Feedback Type (Radio Buttons) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Feedback Type <span className="text-rose-500">*</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(Object.keys(TYPE_CONFIG) as FeedbackType[]).map((tKey) => {
                const conf = TYPE_CONFIG[tKey];
                const IconComp = conf.icon;
                const isSelected = type === tKey;

                return (
                  <label
                    key={tKey}
                    className={`p-3.5 rounded-xl border-2 flex items-center gap-3 cursor-pointer transition-all ${conf.badgeBg} ${
                      isSelected ? `${conf.activeRing} shadow-xs` : 'border-slate-200 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="feedbackType"
                      value={tKey}
                      checked={isSelected}
                      onChange={() => handleTypeChange(tKey)}
                      className="accent-indigo-600 w-4 h-4 cursor-pointer"
                    />
                    <IconComp className={`w-4 h-4 shrink-0 ${conf.badgeText}`} />
                    <span className={`text-xs font-extrabold ${conf.badgeText}`}>
                      {conf.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 2. Dynamic Category Dropdown */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Category <span className="text-rose-500">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              required
            >
              {TYPE_CONFIG[type].categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Title */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Title <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] text-slate-400 font-mono">
                {title.length}/100
              </span>
            </div>
            <input
              type="text"
              maxLength={100}
              placeholder="Brief summary title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              required
            />
          </div>

          {/* 4. Detailed Message */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Detailed Message <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] text-slate-400 font-mono">
                {message.length}/1000
              </span>
            </div>
            <textarea
              rows={4}
              maxLength={1000}
              placeholder="Describe your feedback or issue in detail..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 resize-y"
              required
            />
          </div>

          {/* 5. Severity (ONLY for Bug Report) */}
          {type === 'Bug Report' && (
            <div className="space-y-1.5 animate-in fade-in duration-150">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Severity Level <span className="text-rose-500">*</span>
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as BugSeverity)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
              >
                {SEVERITY_OPTIONS.map((sev) => (
                  <option key={sev} value={sev}>
                    {sev} Severity
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 6. Screenshots / Evidence Upload (Max 3) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Screenshots / Evidence <span className="text-slate-400 font-normal">(Optional, max 3)</span>
            </label>

            {/* Thumbnail grid */}
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {images.map((img, idx) => (
                  <div key={idx} className="relative aspect-video rounded-xl bg-slate-100 border border-slate-200 overflow-hidden group">
                    <img src={img.url} alt="Evidence" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 p-1 bg-slate-900/80 hover:bg-rose-600 text-white rounded-full transition-colors"
                      title="Remove image"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {images.length < 3 && (
              <label className="flex items-center gap-2.5 px-4 py-3 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 hover:border-indigo-500 rounded-xl cursor-pointer text-xs text-slate-700 font-semibold transition-all">
                <Paperclip className="w-4 h-4 text-slate-500" />
                <span>Upload Screenshot ({3 - images.length} remaining)</span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/jpg,image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* 7. Contact Email (auto-filled, editable) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Contact Email <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              required
            />
          </div>

          {/* Submit Action Buttons */}
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
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-extrabold text-xs rounded-xl transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer active:scale-98"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Submit Feedback</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
