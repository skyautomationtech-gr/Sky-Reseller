import React, { useState, useEffect } from 'react';
import { 
  collection, getDocs, query, where, addDoc, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Product, ProductVariant, UserProfile, Order } from '../../types';
import { logAuditAction } from '../../lib/auditLogger';
import { 
  ShoppingBag, Check, AlertTriangle, Loader2, Sparkles, Truck, Gift, 
  FileText, User, Phone, MapPin, CheckCircle2, ChevronDown, Package, 
  X, ArrowLeft, ArrowRight, ShieldCheck, DollarSign
} from 'lucide-react';

interface OrderCustomizationFormProps {
  user: UserProfile;
  initialProduct?: Product | null;
  initialVariant?: ProductVariant | null;
  onSuccess?: (orderId: string, orderNumber: string) => void;
  onCancel?: () => void;
}

export type DeliveryPreferenceOption = 'standard' | 'express' | 'same_day';

const DELIVERY_OPTIONS: {
  id: DeliveryPreferenceOption;
  title: string;
  duration: string;
  cost: number;
  badgeBg: string;
  badgeText: string;
}[] = [
  {
    id: 'standard',
    title: 'Standard Delivery',
    duration: '3-5 business days',
    cost: 60,
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
  },
  {
    id: 'express',
    title: 'Express Delivery',
    duration: '1-2 business days',
    cost: 120,
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-800',
  },
  {
    id: 'same_day',
    title: 'Same Day Delivery',
    duration: 'Dhaka Metro (Same Day)',
    cost: 200,
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-800',
  },
];

export const OrderCustomizationForm: React.FC<OrderCustomizationFormProps> = ({
  user,
  initialProduct = null,
  initialVariant = null,
  onSuccess,
  onCancel,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Form Fields
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(initialProduct);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(initialVariant);
  const [quantity, setQuantity] = useState<number>(1);

  // Customization Fields
  const [specialInstructions, setSpecialInstructions] = useState<string>('');
  const [deliveryPreference, setDeliveryPreference] = useState<DeliveryPreferenceOption>('standard');
  const [giftWrap, setGiftWrap] = useState<boolean>(false);
  const [messageCard, setMessageCard] = useState<string>('');

  // Customer Details
  const [customerName, setCustomerName] = useState<string>(user.fullName || '');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');

  // UI / Submission state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [placedOrderInfo, setPlacedOrderInfo] = useState<{ id: string; orderNumber: string } | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (initialProduct) {
      setSelectedProduct(initialProduct);
      if (initialVariant) {
        setSelectedVariant(initialVariant);
      } else if (initialProduct.hasVariants && initialProduct.variants && initialProduct.variants.length > 0) {
        const activeVars = initialProduct.variants.filter((v) => v.status === 'active' && v.stock > 0);
        if (activeVars.length > 0) {
          setSelectedVariant(activeVars[0]);
        }
      }
    }
  }, [initialProduct, initialVariant]);

  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const q = query(collection(db, 'products'), where('status', '==', 'active'));
      const snap = await getDocs(q);
      const list: Product[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as Product;
        // Filter products with stock > 0
        if (data.stock > 0) {
          list.push({ id: docSnap.id, ...data });
        }
      });
      setProducts(list);

      // If no selected product yet, select first
      if (!selectedProduct && list.length > 0) {
        const p = list[0];
        setSelectedProduct(p);
        if (p.hasVariants && p.variants && p.variants.length > 0) {
          const activeVars = p.variants.filter((v) => v.status === 'active' && v.stock > 0);
          if (activeVars.length > 0) {
            setSelectedVariant(activeVars[0]);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching available products for customization form:', err);
      setError('Failed to load available products list.');
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleProductSelect = (productId: string) => {
    const p = products.find((prod) => prod.id === productId) || null;
    setSelectedProduct(p);
    setSelectedVariant(null);
    setQuantity(1);
    setError('');

    if (p && p.hasVariants && p.variants && p.variants.length > 0) {
      const activeVars = p.variants.filter((v) => v.status === 'active' && v.stock > 0);
      if (activeVars.length > 0) {
        setSelectedVariant(activeVars[0]);
      }
    }
  };

  // Stock calculation
  const currentAvailableStock = selectedVariant
    ? selectedVariant.stock
    : selectedProduct
    ? selectedProduct.stock
    : 0;

  const priceAdjustment = selectedVariant?.priceAdjustment || 0;
  const unitResellerPrice = selectedProduct ? selectedProduct.resellerPrice + priceAdjustment : 0;
  const unitRetailPrice = selectedProduct ? selectedProduct.retailPrice + priceAdjustment : 0;

  const itemSubtotal = unitResellerPrice * quantity;
  const selectedDeliveryCost = DELIVERY_OPTIONS.find((d) => d.id === deliveryPreference)?.cost || 60;
  const giftWrapCost = giftWrap ? 100 : 0;

  const grandTotalAmount = itemSubtotal + selectedDeliveryCost + giftWrapCost;

  const isStockExceeded = quantity > currentAvailableStock;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedProduct) {
      setError('Please select a product.');
      return;
    }

    if (quantity < 1) {
      setError('Quantity must be at least 1.');
      return;
    }

    if (isStockExceeded) {
      setError(`Quantity exceeds available stock (${currentAvailableStock} units available).`);
      return;
    }

    if (selectedProduct.hasVariants && selectedProduct.variants && selectedProduct.variants.length > 0 && !selectedVariant) {
      setError('Please select a color/variant option.');
      return;
    }

    if (!customerName.trim()) {
      setError('Customer name is required.');
      return;
    }

    if (!customerPhone.trim()) {
      setError('Customer phone number is required.');
      return;
    }

    if (!customerAddress.trim()) {
      setError('Customer delivery address is required.');
      return;
    }

    if (specialInstructions.length > 300) {
      setError('Special instructions must not exceed 300 characters.');
      return;
    }

    if (giftWrap && messageCard.length > 100) {
      setError('Message card must not exceed 100 characters.');
      return;
    }

    setSubmitting(true);

    try {
      const randNum = Math.floor(100000 + Math.random() * 900000);
      const generatedOrderNumber = `ORD-${randNum}`;

      const orderData: Omit<Order, 'id'> = {
        orderNumber: generatedOrderNumber,
        resellerId: user.uid,
        resellerName: user.fullName || user.email || 'Reseller',
        resellerShopName: user.shopName || user.fullName || 'Reseller Shop',
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        productImage: selectedProduct.images?.[0]?.url || '',
        categoryId: selectedProduct.categoryId || '',
        variantId: selectedVariant ? selectedVariant.id : null,
        variantColorName: selectedVariant ? selectedVariant.colorName : null,
        quantity: quantity,
        unitRetailPrice: unitRetailPrice,
        unitResellerPrice: unitResellerPrice,
        suggestedRetailPrice: selectedProduct.retailPrice,
        sellingPrice: unitRetailPrice,
        totalAmount: grandTotalAmount,
        sellAmount: grandTotalAmount,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        status: 'pending',
        paymentStatus: 'unpaid',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),

        // Order Customization additions
        specialInstructions: specialInstructions.trim(),
        deliveryPreference: deliveryPreference,
        giftWrap: giftWrap,
        messageCard: giftWrap ? messageCard.trim() : null,
        deliveryCost: selectedDeliveryCost,
        giftWrapCost: giftWrapCost,
        customizations: {
          specialInstructions: specialInstructions.trim(),
          deliveryPreference,
          giftWrap,
          messageCard: giftWrap ? messageCard.trim() : null,
          variantColor: selectedVariant ? selectedVariant.colorName : null,
          deliveryCost: selectedDeliveryCost,
          giftWrapCost: giftWrapCost,
        },
      };

      // 1. Create doc in 'orders' collection
      const docRef = await addDoc(collection(db, 'orders'), orderData);

      // 2. Log audit action
      await logAuditAction(
        user.uid,
        user.fullName,
        user.role,
        'CREATE_CUSTOMIZED_ORDER',
        docRef.id,
        `Placed customized order (${generatedOrderNumber}) for product ${selectedProduct.name} [Qty: ${quantity}]`
      );

      // 3. Create admin notice
      try {
        await addDoc(collection(db, 'notices'), {
          type: 'order_notice',
          title: `New Customized Order [${generatedOrderNumber}]`,
          message: `${user.fullName} placed customized order for ${selectedProduct.name} (Qty: ${quantity}, Total: ৳${grandTotalAmount.toLocaleString('en-BD')}).`,
          targetAudience: 'all',
          publishedBy: user.uid,
          publishedByName: user.fullName,
          createdAt: serverTimestamp(),
        });
      } catch (nErr) {
        console.warn('Notice creation warning:', nErr);
      }

      setPlacedOrderInfo({ id: docRef.id, orderNumber: generatedOrderNumber });

      if (onSuccess) {
        onSuccess(docRef.id, generatedOrderNumber);
      }
    } catch (err: any) {
      console.error('Error placing customized order:', err);
      setError(err?.message || 'Failed to place customized order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-w-3xl mx-auto my-2 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md shadow-indigo-600/30">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white">Order Customization Form</h2>
            <p className="text-[11px] text-slate-400">Add special instructions, delivery preferences & gift options</p>
          </div>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {placedOrderInfo ? (
        <div className="p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner animate-bounce">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider block">Order Confirmation</span>
            <h3 className="text-xl font-extrabold text-slate-900 mt-1">Your order has been placed successfully!</h3>
            <p className="text-xs text-slate-500 mt-1">
              Order Number: <strong className="font-mono text-slate-900">{placedOrderInfo.orderNumber}</strong>
            </p>
          </div>

          {/* Breakdown Card */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl max-w-md mx-auto text-left text-xs space-y-2">
            <div className="flex justify-between font-medium text-slate-600">
              <span>Item ({selectedProduct?.name} x{quantity})</span>
              <span className="font-mono font-bold text-slate-800">৳{itemSubtotal.toLocaleString('en-BD')}</span>
            </div>
            <div className="flex justify-between font-medium text-slate-600">
              <span>Delivery Fee ({DELIVERY_OPTIONS.find((d) => d.id === deliveryPreference)?.title})</span>
              <span className="font-mono font-bold text-slate-800">৳{selectedDeliveryCost}</span>
            </div>
            {giftWrap && (
              <div className="flex justify-between font-medium text-slate-600">
                <span>Gift Wrapping & Card</span>
                <span className="font-mono font-bold text-slate-800">৳100</span>
              </div>
            )}
            <div className="pt-2 border-t border-slate-200 flex justify-between font-extrabold text-slate-900 text-sm">
              <span>Total Amount Paid</span>
              <span className="font-mono text-emerald-600">৳{grandTotalAmount.toLocaleString('en-BD')}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => {
                setPlacedOrderInfo(null);
                setSpecialInstructions('');
                setGiftWrap(false);
                setMessageCard('');
              }}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Create Another Custom Order
            </button>
            {onCancel && (
              <button
                onClick={onCancel}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
              >
                Go to Orders List
              </button>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* 1. Product Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              1. Select Product <span className="text-rose-500">*</span>
            </label>

            {loadingProducts ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Loading available products...</span>
              </div>
            ) : products.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                No active in-stock products available for ordering.
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedProduct?.id || ''}
                  onChange={(e) => handleProductSelect(e.target.value)}
                  className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 appearance-none cursor-pointer pr-10"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — Reseller Price: ৳{p.resellerPrice.toLocaleString('en-BD')} (Stock: {p.stock} units)
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}

            {/* Selected Product Preview Card */}
            {selectedProduct && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3 mt-2">
                <div className="w-14 h-14 rounded-lg bg-white border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                  {selectedProduct.images?.[0]?.url ? (
                    <img
                      src={selectedProduct.images[0].url}
                      alt={selectedProduct.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="w-6 h-6 text-slate-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-extrabold text-slate-900 truncate">{selectedProduct.name}</h4>
                  <div className="flex items-center gap-3 text-[11px] text-slate-600 mt-0.5">
                    <span>Reseller Price: <strong className="text-slate-900 font-mono">৳{selectedProduct.resellerPrice}</strong></span>
                    <span>Retail Price: <strong className="text-slate-900 font-mono">৳{selectedProduct.retailPrice}</strong></span>
                  </div>
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md mt-1 ${
                    currentAvailableStock > 5 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    Available Stock: {currentAvailableStock} units
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 2. Color Variant (if applicable) */}
          {selectedProduct && selectedProduct.hasVariants && selectedProduct.variants && selectedProduct.variants.length > 0 && (
            <div className="space-y-2 animate-in fade-in duration-150">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                2. Choose Color Variant <span className="text-rose-500">*</span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {selectedProduct.variants
                  .filter((v) => v.status === 'active')
                  .map((variant) => {
                    const isSelected = selectedVariant?.id === variant.id;
                    const isOut = variant.stock <= 0;

                    return (
                      <button
                        key={variant.id}
                        type="button"
                        disabled={isOut}
                        onClick={() => {
                          setSelectedVariant(variant);
                          setQuantity(1);
                        }}
                        className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                          isOut
                            ? 'bg-slate-100 border-slate-200 opacity-50 cursor-not-allowed'
                            : isSelected
                            ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {/* Swatch Circle */}
                        <span
                          className="w-4 h-4 rounded-full border border-slate-300 shrink-0 shadow-xs"
                          style={{ backgroundColor: variant.colorCode || '#cbd5e1' }}
                        />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-extrabold text-slate-900 block truncate">
                            {variant.colorName}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {isOut ? 'Out of Stock' : `${variant.stock} left`}
                            {variant.priceAdjustment ? ` (${variant.priceAdjustment > 0 ? '+' : ''}৳${variant.priceAdjustment})` : ''}
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* 3. Quantity */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                3. Quantity <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] font-semibold text-slate-500">
                In Stock: <strong className="text-slate-800">{currentAvailableStock} units</strong>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-10 h-10 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-base flex items-center justify-center transition-colors cursor-pointer"
              >
                -
              </button>

              <input
                type="number"
                min={1}
                max={currentAvailableStock}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className={`w-28 text-center py-2 bg-slate-50 border rounded-xl text-sm font-mono font-extrabold text-slate-900 focus:outline-none ${
                  isStockExceeded
                    ? 'border-rose-400 focus:ring-2 focus:ring-rose-500/20 bg-rose-50/40'
                    : 'border-slate-300 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600'
                }`}
                required
              />

              <button
                type="button"
                onClick={() => setQuantity(Math.min(currentAvailableStock, quantity + 1))}
                className="w-10 h-10 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-base flex items-center justify-center transition-colors cursor-pointer"
              >
                +
              </button>
            </div>

            {isStockExceeded && (
              <p className="text-[11px] font-bold text-rose-600 flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Quantity exceeds available stock ({currentAvailableStock} units).</span>
              </p>
            )}
          </div>

          {/* 4. Special Instructions */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                4. Special Instructions / Customization Notes <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <span className={`text-[10px] font-mono ${specialInstructions.length > 300 ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                {specialInstructions.length}/300
              </span>
            </div>
            <textarea
              rows={3}
              maxLength={300}
              placeholder="Add any special requests (e.g., different packaging, urgent delivery date, custom product sticker, etc.)"
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          {/* 5. Delivery Preference */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              5. Delivery Preference
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {DELIVERY_OPTIONS.map((opt) => {
                const isSelected = deliveryPreference === opt.id;
                return (
                  <label
                    key={opt.id}
                    className={`p-3.5 rounded-xl border-2 flex flex-col justify-between gap-2 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20 shadow-xs'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="deliveryPref"
                          value={opt.id}
                          checked={isSelected}
                          onChange={() => setDeliveryPreference(opt.id)}
                          className="accent-indigo-600 w-4 h-4 cursor-pointer"
                        />
                        <span className="text-xs font-extrabold text-slate-900">{opt.title}</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500">{opt.duration}</p>
                    <span className="text-xs font-mono font-extrabold text-indigo-700 block mt-1">
                      +৳{opt.cost}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 6. Gift Wrap & Message Card */}
          <div className="space-y-3 p-4 bg-pink-50/60 border border-pink-200/80 rounded-2xl">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={giftWrap}
                onChange={(e) => setGiftWrap(e.target.checked)}
                className="w-4 h-4 rounded text-pink-600 focus:ring-pink-500 cursor-pointer accent-pink-600"
              />
              <Gift className="w-4 h-4 text-pink-600" />
              <span className="text-xs font-extrabold text-slate-900">Add Gift Wrapping & Greeting Card (+৳100)</span>
            </label>

            {giftWrap && (
              <div className="space-y-1.5 pt-2 animate-in fade-in duration-150 border-t border-pink-200/60">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-pink-900 uppercase tracking-wider">
                    Personalized Message Card
                  </label>
                  <span className={`text-[10px] font-mono ${messageCard.length > 100 ? 'text-rose-600 font-bold' : 'text-pink-700'}`}>
                    {messageCard.length}/100
                  </span>
                </div>
                <textarea
                  rows={2}
                  maxLength={100}
                  placeholder="Add a personal message for the recipient (e.g., Happy Birthday Tanvir!)"
                  value={messageCard}
                  onChange={(e) => setMessageCard(e.target.value)}
                  className="w-full p-2.5 bg-white border border-pink-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-500/30"
                />
              </div>
            )}
          </div>

          {/* 7. Customer Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-1">
              6. Recipient Customer Details
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">
                  Customer Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">
                  Phone Number <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="017XXXXXXXX"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-700">
                Full Delivery Address <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <textarea
                  rows={2}
                  placeholder="House/Road No, Area, Thana, District"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  required
                />
              </div>
            </div>
          </div>

          {/* Total Calculation Card */}
          <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-3">
            <div className="flex justify-between text-xs text-slate-300">
              <span>Item Subtotal ({quantity}x)</span>
              <span className="font-mono font-bold">৳{itemSubtotal.toLocaleString('en-BD')}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-300">
              <span>Delivery Fee</span>
              <span className="font-mono font-bold">৳{selectedDeliveryCost}</span>
            </div>
            {giftWrap && (
              <div className="flex justify-between text-xs text-slate-300">
                <span>Gift Wrapping & Card</span>
                <span className="font-mono font-bold">৳100</span>
              </div>
            )}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">Total Amount</span>
                <span className="text-xl font-black text-emerald-400 font-mono">
                  ৳{grandTotalAmount.toLocaleString('en-BD')}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={submitting}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting || isStockExceeded}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all shadow-md shadow-emerald-600/30 flex items-center gap-2 cursor-pointer active:scale-98"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Placing Order...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirm & Place Order</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
