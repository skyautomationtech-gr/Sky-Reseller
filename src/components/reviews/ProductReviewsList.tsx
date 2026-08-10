import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ProductReview, UserProfile } from '../../types';
import { Star, MessageSquare, Image as ImageIcon, Sparkles, User, Calendar, Loader2 } from 'lucide-react';

interface ProductReviewsListProps {
  productId: string;
  user?: UserProfile;
  onOpenWriteReview?: () => void;
  activeTab?: string;
  defaultTab?: 'overview' | 'reviews';
}

export const ProductReviewsList: React.FC<ProductReviewsListProps> = ({
  productId,
  user,
  onOpenWriteReview,
}) => {
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    if (productId) {
      fetchReviews();
    }
  }, [productId]);

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'productReviews'),
        where('productId', '==', productId)
      );
      const snap = await getDocs(q);
      const list: ProductReview[] = [];
      snap.forEach((docSnap) => {
        list.push(Object.assign({ id: docSnap.id }, docSnap.data()) as unknown as ProductReview);
      });

      // Sort newest first
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setReviews(list);
    } catch (err) {
      console.error('Error fetching product reviews:', err);
    } finally {
      setLoading(false);
    }
  };

  const avgRating = reviews.length > 0
    ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
    : '0.0';

  const starCounts = [5, 4, 3, 2, 1].map((s) => {
    const count = reviews.filter((r) => Math.round(r.rating) === s).length;
    const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
    return { stars: s, count, pct };
  });

  return (
    <div className="space-y-6">
      {/* Header Summary Card */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5 text-center sm:text-left">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col items-center justify-center min-w-28">
            <span className="text-3xl font-extrabold text-slate-900">{avgRating}</span>
            <div className="flex items-center gap-0.5 my-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-3.5 h-3.5 ${
                    s <= Math.round(Number(avgRating))
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-slate-300'
                  }`}
                />
              ))}
            </div>
            <span className="text-[10px] font-bold text-slate-500">
              {reviews.length} {reviews.length === 1 ? 'Review' : 'Reviews'}
            </span>
          </div>

          {/* Breakdown bars */}
          <div className="space-y-1.5 min-w-48 hidden sm:block">
            {starCounts.map((sc) => (
              <div key={sc.stars} className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                <span className="w-6 text-right">{sc.stars} ★</span>
                <div className="w-28 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: `${sc.pct}%` }}
                  />
                </div>
                <span className="w-6 text-slate-400">{sc.count}</span>
              </div>
            ))}
          </div>
        </div>

        {onOpenWriteReview && (
          <button
            onClick={onOpenWriteReview}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center gap-2 cursor-pointer active:scale-98 shrink-0"
          >
            <Star className="w-4 h-4 fill-white" />
            <span>Write a Review</span>
          </button>
        )}
      </div>

      {/* Reviews List */}
      {loading ? (
        <div className="p-8 text-center text-slate-500 flex items-center justify-center gap-2 text-xs">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          <span>Loading product reviews...</span>
        </div>
      ) : reviews.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
            <MessageSquare className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">No Reviews Yet</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Be the first reseller to review this product after receiving your order!
          </p>
          {onOpenWriteReview && (
            <button
              onClick={onOpenWriteReview}
              className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
            >
              Write First Review
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((rev) => {
            let dateStr = 'Recently';
            if (rev.createdAt) {
              if (rev.createdAt.toDate) {
                dateStr = rev.createdAt.toDate().toLocaleDateString();
              } else if (rev.createdAt.seconds) {
                dateStr = new Date(rev.createdAt.seconds * 1000).toLocaleDateString();
              } else if (typeof rev.createdAt === 'string') {
                dateStr = new Date(rev.createdAt).toLocaleDateString();
              }
            }

            return (
              <div
                key={rev.id}
                className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3 hover:border-blue-200 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-slate-900 text-white font-extrabold text-xs rounded-full flex items-center justify-center">
                      {(rev.resellerName || 'R')[0].toUpperCase()}
                    </div>
                    <div>
                      <h5 className="text-xs font-extrabold text-slate-900">{rev.resellerName || 'Verified Reseller'}</h5>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-3 h-3 ${
                                s <= rev.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {dateStr}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
                    Verified Buyer
                  </span>
                </div>

                {/* Review Title & Description */}
                <div>
                  <h6 className="text-xs font-bold text-slate-900">{rev.title}</h6>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed whitespace-pre-line">
                    {rev.description}
                  </p>
                </div>

                {/* Attached Image if any */}
                {rev.imageUrl && (
                  <div className="pt-2">
                    <button
                      onClick={() => setSelectedImage(rev.imageUrl || null)}
                      className="group relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 hover:opacity-90 transition-opacity"
                    >
                      <img src={rev.imageUrl} alt="Review attachment" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-slate-900/20 group-hover:bg-slate-900/40 flex items-center justify-center transition-colors">
                        <ImageIcon className="w-4 h-4 text-white drop-shadow-xs" />
                      </div>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Modal for attached review photo */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="relative max-w-xl w-full bg-slate-950 p-2 rounded-2xl border border-slate-800 shadow-2xl">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 bg-slate-800 text-slate-300 hover:text-white p-2 rounded-xl transition-colors z-10"
            >
              ✕
            </button>
            <img src={selectedImage} alt="Enlarged review photo" className="w-full h-auto max-h-[80vh] object-contain rounded-xl" />
          </div>
        </div>
      )}
    </div>
  );
};
