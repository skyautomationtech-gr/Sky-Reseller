import React, { useState, useEffect } from 'react';
import { 
  collection, getDocs, query, where, doc, runTransaction, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Product, ProductVariant, UserProfile } from '../../types';
import { X, ShoppingBag, Search, Check, AlertCircle, Loader2, Sparkles } from 'lucide-react';

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onOrderCreated: () => void;
  initialProduct?: Product | null;
  initialVariant?: ProductVariant | null;
}

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({
  isOpen,
  onClose,
  user,
  onOrderCreated,
  initialProduct = null,
  initialVariant = null
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(initialProduct);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(initialVariant);
  const [quantity, setQuantity] = useState<number>(1);
  const [sellingPrice, setSellingPrice] = useState<number>(0);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'paid' | 'partial'>('unpaid');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchProducts();
      resetForm();
      if (initialProduct) {
        setSelectedProduct(initialProduct);
        let initialPrice = initialProduct.retailPrice;
        if (initialVariant) {
          setSelectedVariant(initialVariant);
          initialPrice = initialProduct.retailPrice + (initialVariant.priceAdjustment || 0);
        } else if (initialProduct.hasVariants && initialProduct.variants && initialProduct.variants.length > 0) {
          const activeVars = initialProduct.variants.filter(v => v.status === 'active');
          if (activeVars.length > 0) {
            setSelectedVariant(activeVars[0]);
            initialPrice = initialProduct.retailPrice + (activeVars[0].priceAdjustment || 0);
          }
        }
        setSellingPrice(initialPrice);
      }
    }
  }, [isOpen, initialProduct, initialVariant]);

  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const q = query(collection(db, 'products'), where('status', '==', 'active'));
      const snap = await getDocs(q);
      const list: Product[] = [];
      snap.forEach((docSnap) => {
        list.push(Object.assign({ id: docSnap.id }, docSnap.data()) as unknown as Product);
      });
      setProducts(list);
    } catch (err) {
      console.error('Error fetching products for order:', err);
    } finally {
      setLoadingProducts(false);
    }
  };

  const resetForm = () => {
    setSelectedProduct(null);
    setSelectedVariant(null);
    setQuantity(1);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setPaymentStatus('unpaid');
    setError('');
    setSellingPrice(0);
  };

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setSelectedVariant(null);
    setQuantity(1);
    setError('');

    let initialPrice = product.retailPrice;
    // If product has variants and variants exist, auto-select first active variant if available
    if (product.hasVariants && product.variants && product.variants.length > 0) {
      const activeVariants = product.variants.filter((v) => v.status === 'active');
      if (activeVariants.length > 0) {
        setSelectedVariant(activeVariants[0]);
        initialPrice = product.retailPrice + (activeVariants[0].priceAdjustment || 0);
      }
    }
    setSellingPrice(initialPrice);
  };

  const availableStock = selectedProduct
    ? selectedProduct.hasVariants && selectedVariant
      ? selectedVariant.stock
      : selectedProduct.stock
    : 0;

  const baseResellerPrice = selectedProduct ? selectedProduct.resellerPrice : 0;
  const baseRetailPrice = selectedProduct ? selectedProduct.retailPrice : 0;
  const variantAdjustment = (selectedProduct?.hasVariants && selectedVariant) ? (selectedVariant.priceAdjustment || 0) : 0;

  const unitResellerPrice = baseResellerPrice + variantAdjustment;
  const suggestedRetailPrice = baseRetailPrice + variantAdjustment;
  const unitRetailPrice = suggestedRetailPrice; // Alias for UI backwards-compatibility

  const totalAmount = quantity * sellingPrice;
  const sellAmount = quantity * (sellingPrice - unitResellerPrice); // Reseller's profit (using actual selling price)

  const validatePhone = (num: string) => {
    const cleanNum = num.trim();
    const bdRegex = /^(?:\+88|88)?01[3-9]\d{8}$/;
    return bdRegex.test(cleanNum);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      setError('Please select a product from the list.');
      return;
    }

    if (selectedProduct.hasVariants && !selectedVariant) {
      setError('Please select a color variant for this product.');
      return;
    }

    if (quantity < 1) {
      setError('Quantity must be at least 1.');
      return;
    }

    if (quantity > availableStock) {
      setError(`Quantity exceeds available stock (${availableStock}).`);
      return;
    }

    if (!customerName.trim()) {
      setError('Customer name is required.');
      return;
    }

    if (!validatePhone(customerPhone)) {
      setError('Valid Bangladeshi phone number is required (e.g., 017XXXXXXXX).');
      return;
    }

    if (!customerAddress.trim()) {
      setError('Customer address is required.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Generate global incremental order number using Firestore transaction
      const counterRef = doc(db, 'counters', 'orderCounter');
      
      let nextOrderNumber = 'ORD-000001';

      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let count = 1;
        if (counterDoc.exists()) {
          count = (counterDoc.data().current || 0) + 1;
        }
        transaction.set(counterRef, { current: count }, { merge: true });

        const paddedNumber = String(count).padStart(6, '0');
        nextOrderNumber = `ORD-${paddedNumber}`;

        // Create the new order document reference
        const newOrderRef = doc(collection(db, 'orders'));

        transaction.set(newOrderRef, {
          orderNumber: nextOrderNumber,
          resellerId: user.uid,
          resellerName: user.fullName,
          resellerShopName: user.shopName || user.fullName,
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          productImage: selectedProduct.images?.[0]?.url || '',
          categoryId: selectedProduct.categoryId || '',
          variantId: selectedVariant ? selectedVariant.id : null,
          variantColorName: selectedVariant ? selectedVariant.colorName : null,
          quantity,
          unitRetailPrice,
          suggestedRetailPrice,
          sellingPrice,
          unitResellerPrice,
          totalAmount,
          sellAmount,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerAddress: customerAddress.trim(),
          status: 'pending',
          paymentStatus,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      onOrderCreated();
      onClose();
    } catch (err: any) {
      console.error('Order creation error:', err);
      setError(err.message || 'Failed to submit order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.categoryName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-600/30">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Create New Reseller Order</h2>
              <p className="text-[11px] text-slate-400">Place an order on behalf of your customer</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Step 1: Product Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              1. Select Product <span className="text-rose-500">*</span>
            </label>

            {/* Product Search & Dropdown List */}
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search active products by name, SKU, or category..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                />
              </div>

              {loadingProducts ? (
                <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span>Loading catalog items...</span>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                  No active products found.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                  {filteredProducts.map((p) => {
                    const isSelected = selectedProduct?.id === p.id;
                    const mainImage = p.images?.[0]?.url;
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectProduct(p)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-blue-50 border-blue-500 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-blue-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {mainImage ? (
                            <img
                              src={mainImage}
                              alt={p.name}
                              className="w-10 h-10 object-cover rounded-lg border border-slate-200"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-[10px] font-bold">
                              NO IMG
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-bold text-slate-900 line-clamp-1">{p.name}</p>
                            <p className="text-[11px] text-slate-500">
                              SKU: {p.sku} • Stock: <span className="font-semibold text-slate-700">{p.stock}</span>
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-900">৳{p.retailPrice}</p>
                          <p className="text-[10px] text-emerald-600 font-semibold">Reseller: ৳{p.resellerPrice}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Color Variant Selector (if applicable) */}
          {selectedProduct?.hasVariants && (
            <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-2xl space-y-3">
              <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider">
                Select Color Variant <span className="text-rose-500">*</span>
              </label>

              {(!selectedProduct.variants || selectedProduct.variants.filter((v) => v.status === 'active').length === 0) ? (
                <p className="text-xs text-amber-700">No active variants available for this product.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {selectedProduct.variants
                    .filter((v) => v.status === 'active')
                    .map((variant) => {
                      const isVarSelected = selectedVariant?.id === variant.id;
                      return (
                        <button
                          type="button"
                          key={variant.id}
                          onClick={() => {
                            setSelectedVariant(variant);
                            setError('');
                            if (selectedProduct) {
                              setSellingPrice(selectedProduct.retailPrice + (variant.priceAdjustment || 0));
                            }
                          }}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left text-xs font-medium transition-all ${
                            isVarSelected
                              ? 'bg-amber-100 border-amber-500 text-amber-900 ring-2 ring-amber-400'
                              : 'bg-white border-amber-200 text-slate-700 hover:bg-amber-50'
                          }`}
                        >
                          <span
                            className="w-4 h-4 rounded-full border border-slate-300 shrink-0"
                            style={{ backgroundColor: variant.colorName.toLowerCase() }}
                          />
                          <div className="overflow-hidden">
                            <p className="font-bold truncate">{variant.colorName}</p>
                            <p className="text-[10px] text-slate-500">Stock: {variant.stock}</p>
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Quantity & Price Calculation Card */}
          {selectedProduct && (
            <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider block">
                    Selected Item
                  </span>
                  <p className="text-sm font-bold text-white">
                    {selectedProduct.name}
                    {selectedVariant ? ` (${selectedVariant.colorName})` : ''}
                  </p>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Available Stock: <span className="font-bold text-emerald-400">{availableStock} units</span>
                  </p>
                </div>

                {/* Quantity Spinner */}
                <div className="flex items-center gap-3">
                  <label className="text-xs font-semibold text-slate-300">Quantity:</label>
                  <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="px-3 py-1.5 text-slate-300 hover:text-white hover:bg-slate-700 font-bold"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={availableStock}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Math.min(availableStock, parseInt(e.target.value) || 1)))}
                      className="w-14 text-center bg-transparent text-white font-bold text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(availableStock, q + 1))}
                      className="px-3 py-1.5 text-slate-300 hover:text-white hover:bg-slate-700 font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Selling Price Input Row */}
              <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Your Selling Price (per unit) <span className="text-rose-400">*</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[10px] text-slate-400">
                      Suggested Retail Price: <span className="font-semibold text-slate-200">৳{suggestedRetailPrice}</span>
                    </span>
                    <span className="text-[10px] text-slate-500">•</span>
                    <span className="text-[10px] text-slate-400">
                      Your Cost Price: <span className="font-semibold text-emerald-400">৳{unitResellerPrice}</span>
                    </span>
                  </div>
                </div>

                <div className="relative w-full sm:w-48">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">৳</span>
                  <input
                    type="number"
                    min={0}
                    required
                    value={sellingPrice || ''}
                    onChange={(e) => setSellingPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full pl-7 pr-3.5 py-2 text-xs bg-slate-800 border border-slate-700 rounded-xl text-white font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Enter selling price"
                  />
                </div>
              </div>

              {/* Warning label if Selling Price is lower than Cost Price */}
              {selectedProduct && sellingPrice < unitResellerPrice && (
                <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl text-[11px] text-amber-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p>
                    Selling price is lower than your cost price — you'll have a negative commission on this order.
                  </p>
                </div>
              )}

              {/* Price Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800 text-xs">
                <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                  <span className="text-[10px] text-slate-400 block">Unit Selling Price</span>
                  <span className="text-sm font-bold text-white">৳{sellingPrice}</span>
                </div>
                <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                  <span className="text-[10px] text-slate-400 block">Total Amount (Customer Pays)</span>
                  <span className="text-sm font-bold text-blue-400">৳{totalAmount}</span>
                </div>
                <div className="bg-emerald-950/60 p-2.5 rounded-xl border border-emerald-500/30">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-300" /> Your Profit / Commission
                  </span>
                  <span className={`text-sm font-bold ${sellAmount >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                    ৳{sellAmount}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Customer Details Form */}
          <div className="space-y-4">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              2. Customer & Shipping Details <span className="text-rose-500">*</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Customer Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Rahat Ahmed"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Customer Phone Number</label>
                <input
                  type="text"
                  placeholder="e.g. 01712345678"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Full Shipping Address</label>
              <textarea
                rows={2}
                placeholder="House, Road, Area, Thana, District"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                required
              />
            </div>

            {/* Payment Status Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Status</label>
              <div className="flex gap-2">
                {(['unpaid', 'paid', 'partial'] as const).map((st) => (
                  <button
                    type="button"
                    key={st}
                    onClick={() => setPaymentStatus(st)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all border ${
                      paymentStatus === st
                        ? st === 'paid'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : st === 'partial'
                          ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                          : 'bg-slate-800 text-white border-slate-800 shadow-sm'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedProduct || availableStock < 1}
              className="px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-md shadow-blue-600/30 flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Placing Order...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Confirm & Submit Order</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
