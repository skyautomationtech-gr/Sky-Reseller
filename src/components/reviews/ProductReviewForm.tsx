import React, { useState, useEffect } from 'react';
import { 
  collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, Order, Product, ProductReview } from '../../types';
import { 
  Star, Upload, X, CheckCircle2, AlertCircle, Loader2, Package, Sparkles, MessageSquare, Image as ImageIcon
} from 'lucide-react';

interface DeliveredProductOption {
  productId: string;
  productName: string;
  productImage?: string;
  resellerPrice: number;
}

interface ProductReviewFormProps {
  user: UserProfile;
  initialProductId?: string;
  onSuccessRedirect?: (productId: string) => void;
  onClose?: () => void;
}

export const ProductReviewForm: React.FC<ProductReviewFormProps> = ({
  user,
  initialProductId,
  onSuccessRedirect,
  onClose,
}) => {
  const [deliveredProducts, setDeliveredProducts] = useState<DeliveredProductOption[]>([]);
  const [loadingDelivered, setLoadingDelivered] = useState(true);

  // Form states
  const [selectedProductId, setSelectedProductId] = useState<string>(initialProductId || '');
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>(user.shopName || user.fullName || '');
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Status states
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [submittedTimestamp, setSubmittedTimestamp] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');

  useEffect(() => {
    fetchDeliveredProducts();
  }, [user.uid]);

  const fetchDeliveredProducts = async () => {
    setLoadingDelivered(true);
    try {
      // Query delivered orders for this reseller
      const q = query(
        collection(db, 'orders'),
        where('resellerId', '==', user.uid),
        where('status', '==', 'delivered')
      );
      const snap = await getDocs(q);

      const productMap = new Map<string, DeliveredProductOption>();

      snap.forEach((docSnap) => {
        const orderData = docSnap.data() as Order;
        if (orderData.productId && !productMap.has(orderData.productId)) {
          productMap.set(orderData.productId, {
            productId: orderData.productId,
            productName: orderData.productName || 'Product',
            productImage: orderData.productImage || '',
            resellerPrice: orderData.unitResellerPrice || 0,
          });
        }
      });

      // Also if initialProductId is passed but not in delivered orders, fetch that product details so user can still review
      if (initialProductId && !productMap.has(initialProductId)) {
        try {
          const pDoc = await getDoc(doc(db, 'products', initialProductId));
          if (pDoc.exists()) {
            const pData = pDoc.data() as Product;
            productMap.set(initialProductId, {
              productId: pDoc.id,
              productName: pData.name,
              productImage: pData.images?.[0]?.url || '',
              resellerPrice: pData.resellerPrice,
            });
          }
        } catch (e) {
          console.error('Error fetching initial product:', e);
        }
      }

      const options = Array.from(productMap.values());
      setDeliveredProducts(options);

      if (!selectedProductId && options.length > 0) {
        setSelectedProductId(options[0].productId);
      }
    } catch (err) {
      console.error('Error fetching delivered products for review:', err);
    } finally {
      setLoadingDelivered(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file (JPEG/PNG/WEBP).');
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setError('Image size exceeds 3MB. Please upload a smaller image.');
      return;
    }

    setError('');
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setImagePreview(dataUrl);
      };
      img.onerror = () => {
        setImagePreview(event.target?.result as string);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedProductId) {
      setError('Please select a product to review.');
      return;
    }

    if (rating === 0) {
      setError('Please select a rating from 1 to 5 stars.');
      return;
    }

    if (!title.trim()) {
      setError('Please enter a review title.');
      return;
    }

    if (title.trim().length > 50) {
      setError('Review title cannot exceed 50 characters.');
      return;
    }

    if (!description.trim()) {
      setError('Please enter a review description.');
      return;
    }

    if (description.trim().length > 500) {
      setError('Review description cannot exceed 500 characters.');
      return;
    }

    if (!displayName.trim()) {
      setError('Please enter a display name.');
      return;
    }

    setSubmitting(true);

    try {
      const selectedOption = deliveredProducts.find((p) => p.productId === selectedProductId);
      const now = new Date();

      const reviewData: Omit<ProductReview, 'id'> = {
        productId: selectedProductId,
        productName: selectedOption?.productName || 'Product',
        productImage: selectedOption?.productImage || '',
        resellerId: user.uid,
        resellerName: displayName.trim(),
        rating,
        title: title.trim(),
        description: description.trim(),
        imageUrl: imagePreview || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'productReviews'), reviewData);

      // Send notice notification to Admin
      try {
        await addDoc(collection(db, 'notices'), {
          type: 'offer',
          title: `New Product Review (${rating}★)`,
          message: `${displayName.trim()} left a ${rating}-star review on "${selectedOption?.productName || 'Product'}": "${title.trim()}"`,
          targetAudience: 'all',
          publishedBy: user.uid,
          publishedByName: displayName.trim(),
          createdAt: serverTimestamp(),
        });
      } catch (noticeErr) {
        console.warn('Could not create review notice:', noticeErr);
      }

      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) + ', ' + now.toLocaleDateString();
      setSubmittedTimestamp(timeStr);
      setSuccessMessage('Review submitted successfully!');

      // Redirect after 2 seconds
      setTimeout(() => {
        if (onSuccessRedirect) {
          onSuccessRedirect(selectedProductId);
        } else if (onClose) {
          onClose();
        }
      }, 2000);

    } catch (err: any) {
      console.error('Error submitting review:', err);
      setError(err?.message || 'Failed to submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedProduct = deliveredProducts.find((p) => p.productId === selectedProductId);

  return (
    <div className="fixed sm:relative inset-0 sm:inset-auto z-50 sm:z-auto w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-2xl bg-white sm:rounded-2xl border-0 sm:border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in fade-in sm:zoom-in-95 duration-200">
      {/* Header - Sticky */}
      <div className="sticky top-0 z-20 bg-slate-900 text-white px-4 sm:px-6 py-4 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-slate-950 font-bold shadow-md shadow-amber-500/20">
            <Star className="w-5 h-5 fill-slate-950" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white">Write a Product Review</h2>
            <p className="text-[11px] text-slate-400">Share feedback on products you've received</p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Success Notification overlay */}
      {successMessage ? (
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 flex flex-col justify-center items-center text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner animate-bounce">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <h3 className="text-xl font-extrabold text-slate-900">{successMessage}</h3>
          {submittedTimestamp && (
            <p className="text-xs text-slate-500">
              Submitted at <span className="font-semibold text-slate-700">{submittedTimestamp}</span>
            </p>
          )}
          <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-xs text-emerald-800 max-w-md mx-auto flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Redirecting to product details page in 2 seconds...</span>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {error && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            {/* 1. Product Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Select Product <span className="text-rose-500">*</span>
              </label>

              {loadingDelivered ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span>Loading your delivered products...</span>
                </div>
              ) : deliveredProducts.length === 0 ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-3">
                  <Package className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">No delivered products found in your account.</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      You can submit reviews once an order placed on your account is marked as <strong>Delivered</strong>.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full h-11 sm:h-10 px-3.5 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 appearance-none cursor-pointer"
                  >
                    <option value="" disabled>-- Select a Delivered Product --</option>
                    {deliveredProducts.map((item) => (
                      <option key={item.productId} value={item.productId}>
                        {item.productName} (Price: ৳{item.resellerPrice})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Selected Product Preview Card */}
              {selectedProduct && (
                <div className="mt-2 p-3 bg-blue-50/60 border border-blue-200/80 rounded-xl flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                    {selectedProduct.productImage ? (
                      <img src={selectedProduct.productImage} alt={selectedProduct.productName} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{selectedProduct.productName}</h4>
                    <p className="text-[11px] font-semibold text-blue-700 mt-0.5">
                      Reseller Price: ৳{selectedProduct.resellerPrice}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Star Rating Component */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Rating <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center gap-3 py-1">
                {[1, 2, 3, 4, 5].map((starVal) => {
                  const isLit = starVal <= (hoverRating || rating);
                  return (
                    <button
                      key={starVal}
                      type="button"
                      onClick={() => setRating(starVal)}
                      onMouseEnter={() => setHoverRating(starVal)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="p-1.5 rounded-xl hover:bg-amber-50 focus:outline-none transition-all cursor-pointer group active:scale-95 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      title={`${starVal} Star${starVal > 1 ? 's' : ''}`}
                    >
                      <Star
                        className={`w-9 h-9 sm:w-8 sm:h-8 transition-colors ${
                          isLit
                            ? 'text-amber-400 fill-amber-400 drop-shadow-xs'
                            : 'text-slate-300 fill-slate-100 group-hover:text-amber-300'
                        }`}
                      />
                    </button>
                  );
                })}
                <span className="ml-2 text-xs font-extrabold text-slate-700 hidden sm:inline">
                  {hoverRating || rating ? `${hoverRating || rating} / 5 Stars` : 'Click stars to rate'}
                </span>
              </div>
              <p className="sm:hidden text-xs font-extrabold text-slate-700">
                {hoverRating || rating ? `Selected: ${hoverRating || rating} / 5 Stars` : 'Tap stars to select rating'}
              </p>
            </div>

            {/* 3. Review Title */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Review Title <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  {title.length}/50
                </span>
              </div>
              <input
                type="text"
                maxLength={50}
                placeholder="Great product!"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-11 sm:h-10 px-4 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>

            {/* 4. Review Description */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Review Description <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  {description.length}/500
                </span>
              </div>
              <textarea
                rows={4}
                maxLength={500}
                placeholder="Share your experience with this product..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full min-h-[110px] px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 resize-y"
              />
            </div>

            {/* 5. Upload Image (Optional) */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Product Photo / Usage Image <span className="text-slate-400 font-normal">(Optional)</span>
              </label>

              {imagePreview ? (
                <div className="relative w-32 h-32 rounded-xl border-2 border-dashed border-slate-300 bg-slate-100 overflow-hidden group">
                  <img src={imagePreview} alt="Review Preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImagePreview(null)}
                    className="absolute top-1.5 right-1.5 bg-slate-900/80 text-white p-1 rounded-lg hover:bg-rose-600 transition-colors shadow-md min-h-[32px] min-w-[32px] flex items-center justify-center"
                    title="Remove image"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/50 rounded-xl cursor-pointer transition-all min-h-[110px]">
                  <Upload className="w-8 h-8 text-blue-600 mb-2" />
                  <span className="text-sm font-extrabold text-slate-800">Tap to upload photo</span>
                  <span className="text-[11px] text-slate-500 mt-0.5">JPEG, PNG or WEBP up to 3MB</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {/* 6. Display Name (Pre-filled) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Display Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full h-11 sm:h-10 px-4 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
              <p className="text-[11px] text-slate-400">This name will be shown publicly alongside your review.</p>
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="sticky bottom-0 z-20 bg-slate-50 px-4 sm:px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-5 py-3 sm:py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm sm:text-xs rounded-xl transition-colors min-h-[44px] sm:min-h-[38px] flex items-center justify-center"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || deliveredProducts.length === 0}
              className="px-6 py-3 sm:py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold text-sm sm:text-xs rounded-xl transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 cursor-pointer active:scale-98 min-h-[44px] sm:min-h-[38px]"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Submitting Review...</span>
                </>
              ) : (
                <>
                  <Star className="w-4 h-4 fill-white animate-pulse" />
                  <span>Submit Review</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
