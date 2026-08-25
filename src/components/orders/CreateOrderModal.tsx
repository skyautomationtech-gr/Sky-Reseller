import React, { useState, useEffect } from 'react';
import { 
  collection, getDocs, query, where, doc, runTransaction, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Product, ProductVariant, UserProfile, CartItem } from '../../types';
import { X, ShoppingBag, Search, Check, AlertCircle, Loader2, Sparkles, AlertTriangle, WifiOff } from 'lucide-react';
import { useNetwork } from '../../context/NetworkContext';
import { createAppNotification } from '../../lib/notificationHelper';

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onOrderCreated: () => void;
  initialProduct?: Product | null;
  initialVariant?: ProductVariant | null;
  cartItems?: CartItem[] | null;
}

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({
  isOpen,
  onClose,
  user,
  onOrderCreated,
  initialProduct = null,
  initialVariant = null,
  cartItems = null
}) => {
  const { isOnline } = useNetwork();
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

  const isCartMode = !!(cartItems && cartItems.length > 0);

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

  // Multi-item Cart calculations
  const cartTotalResellerCost = isCartMode && cartItems
    ? cartItems.reduce((acc, item) => {
        const vAdj = item.variant ? (item.variant.priceAdjustment || 0) : 0;
        return acc + (item.product.resellerPrice + vAdj) * item.quantity;
      }, 0)
    : 0;

  const cartTotalSellingPrice = isCartMode && cartItems
    ? cartItems.reduce((acc, item) => acc + item.sellingPrice * item.quantity, 0)
    : 0;

  const cartTotalProfit = isCartMode
    ? cartTotalSellingPrice - cartTotalResellerCost
    : 0;

  const totalAmount = isCartMode ? cartTotalSellingPrice : (quantity * sellingPrice);
  const sellAmount = isCartMode ? cartTotalProfit : (quantity * (sellingPrice - unitResellerPrice));

  const validatePhone = (num: string) => {
    const cleanNum = num.trim();
    const bdRegex = /^(?:\+88|88)?01[3-9]\d{8}$/;
    return bdRegex.test(cleanNum);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isOnline) {
      setError('No internet connection. Please check your internet connection and try again.');
      return;
    }

    if (isCartMode) {
      if (!cartItems || cartItems.length === 0) {
        setError('Cart is empty.');
        return;
      }
      // Check stock for all cart items
      for (const item of cartItems) {
        const itemStock = item.variant ? item.variant.stock : item.product.stock;
        if (item.quantity > itemStock) {
          setError(`"${item.product.name}" quantity exceeds available stock (${itemStock}).`);
          return;
        }
      }
    } else {
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

      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let count = 1;
        if (counterDoc.exists()) {
          count = (counterDoc.data().current || 0) + 1;
        }
        transaction.set(counterRef, { current: count }, { merge: true });

        if (isCartMode && cartItems) {
          for (let index = 0; index < cartItems.length; index++) {
            const item = cartItems[index];
            const p = item.product;
            const v = item.variant;
            const q = item.quantity;
            const sPrice = item.sellingPrice;

            const vAdj = v ? (v.priceAdjustment || 0) : 0;
            const itemUnitResellerPrice = p.resellerPrice + vAdj;
            const itemUnitRetailPrice = p.retailPrice + vAdj;
            const itemTotalAmount = q * sPrice;
            const itemSellAmount = q * (sPrice - itemUnitResellerPrice);

            // Generate unique random suffix part for the order number
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let randPart = '';
            for (let i = 0; i < 4; i++) {
              randPart += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            const itemOrderNumber = `SAT_ORD-${randPart}${cartItems.length > 1 ? `-${index + 1}` : ''}`;

            const newOrderRef = doc(collection(db, 'orders'));
            transaction.set(newOrderRef, {
              orderNumber: itemOrderNumber,
              resellerId: user.uid,
              resellerName: user.fullName,
              resellerShopName: user.shopName || user.fullName,
              productId: p.id,
              productName: p.name,
              productImage: p.images?.[0]?.url || '',
              categoryId: p.categoryId || '',
              variantId: v ? v.id : null,
              variantColorName: v ? v.colorName : null,
              quantity: q,
              unitRetailPrice: itemUnitRetailPrice,
              suggestedRetailPrice: itemUnitRetailPrice,
              sellingPrice: sPrice,
              unitResellerPrice: itemUnitResellerPrice,
              totalAmount: itemTotalAmount,
              sellAmount: itemSellAmount,
              customerName: customerName.trim(),
              customerPhone: customerPhone.trim(),
              customerAddress: customerAddress.trim(),
              status: 'pending',
              paymentStatus,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } else if (selectedProduct) {
          // Generate unique random suffix part for the order number
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          let randPart = '';
          for (let i = 0; i < 4; i++) {
            randPart += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          const nextOrderNumber = `SAT_ORD-${randPart}`;

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
        }
      });

      // Notify Admins
      try {
        const primaryOrderNumber = isCartMode && cartItems && cartItems.length > 0 
          ? `Cart (${cartItems.length} items)` 
          : 'New';

        await createAppNotification({
          title: `New Order: #${primaryOrderNumber} 📦`,
          message: `Reseller ${user.fullName || user.shopName || 'Reseller'} placed a new order for ${customerName.trim()} (৳${totalAmount}).`,
          type: 'new_order',
          targetAudience: 'admin',
          metadata: {
            orderNumber: primaryOrderNumber,
            resellerId: user.uid,
            customerName: customerName.trim(),
            totalAmount,
            type: 'new_order',
          },
          priority: 'high',
        });
      } catch (notifErr) {
        console.error('Failed to notify admin of new order:', notifErr);
      }

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-hidden">
      <div className="fixed sm:relative inset-0 sm:inset-auto w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-3xl bg-white sm:rounded-2xl border-0 sm:border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in fade-in sm:zoom-in-95 duration-200">
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 py-4 bg-slate-900 text-white shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md shadow-blue-600/30 shrink-0">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">Create New Reseller Order</h2>
              <p className="text-[11px] text-slate-400">Place an order on behalf of your customer</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
            {isCartMode && cartItems ? (
              <div className="space-y-4">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  1. Order Summary (Cart Items)
                </label>
                
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
                  {cartItems.map((item) => {
                    const mainImage = item.product.images?.[0]?.url;
                    const vAdj = item.variant ? (item.variant.priceAdjustment || 0) : 0;
                    const itemCostPrice = item.product.resellerPrice + vAdj;
                    const itemProfit = item.sellingPrice - itemCostPrice;
                    const itemIsNegativeProfit = item.sellingPrice < itemCostPrice;

                    return (
                      <div key={item.id} className="p-3.5 flex items-center justify-between gap-4 bg-slate-50/30">
                        <div className="flex items-center gap-3">
                          {mainImage ? (
                            <img
                              src={mainImage}
                              alt={item.product.name}
                              className="w-12 h-12 object-cover rounded-xl border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 text-[10px] font-bold shrink-0">
                              NO IMG
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-950 line-clamp-1">{item.product.name}</p>
                            {item.variant && (
                              <p className="text-[10px] text-amber-700 font-semibold mt-0.5">
                                Color: {item.variant.colorName}
                              </p>
                            )}
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              Qty: <span className="font-bold text-slate-700">{item.quantity}</span> • 
                              Cost: <span className="font-semibold text-slate-700">৳{itemCostPrice}</span>
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-xs font-bold text-slate-900">
                            ৳{item.sellingPrice} <span className="text-[10px] font-normal text-slate-500">/ unit</span>
                          </div>
                          <div className={`text-[10px] font-semibold mt-0.5 ${itemIsNegativeProfit ? 'text-rose-500' : 'text-emerald-600'}`}>
                            Profit: ৳{itemProfit * item.quantity}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Warnings for lower selling price */}
                {cartItems.some(item => item.sellingPrice < (item.product.resellerPrice + (item.variant?.priceAdjustment || 0))) && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p>
                      One or more items have a selling price lower than your cost price. This will result in negative profit for those items.
                    </p>
                  </div>
                )}

                {/* Big summary card */}
                <div className="p-4 bg-slate-900 text-white rounded-2xl">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="border-r border-slate-800">
                      <span className="text-[10px] text-slate-400 block uppercase tracking-wider">Total Customer Pays</span>
                      <span className="text-base font-black text-blue-400">৳{totalAmount}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-400 block uppercase tracking-wider font-bold">Total Profit / Commission</span>
                      <span className={`text-base font-black ${sellAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ৳{sellAmount}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Step 1: Product Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    1. Select Product <span className="text-rose-500">*</span>
                  </label>

                  {/* Product Search & Dropdown List */}
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search active products by name, SKU, or category..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-11 pl-10 pr-4 text-base sm:text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
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
                              className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all min-h-[48px] ${
                                isSelected
                                  ? 'bg-blue-50 border-blue-500 shadow-xs ring-1 ring-blue-500'
                                  : 'bg-white border-slate-200 hover:border-blue-300'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                {mainImage ? (
                                  <img
                                    src={mainImage}
                                    alt={p.name}
                                    className="w-10 h-10 object-cover rounded-lg border border-slate-200 shrink-0"
                                  />
                                ) : (
                                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-[10px] font-bold shrink-0">
                                    NO IMG
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-900 truncate">{p.name}</p>
                                  <p className="text-[11px] text-slate-500">
                                    SKU: {p.sku} • Stock: <span className="font-semibold text-slate-700">{p.stock}</span>
                                  </p>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
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
                                className={`flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs font-medium transition-all min-h-[48px] cursor-pointer ${
                                  isVarSelected
                                    ? 'bg-amber-100 border-amber-500 text-amber-900 ring-2 ring-amber-400 font-bold'
                                    : 'bg-white border-amber-200 text-slate-700 hover:bg-amber-50'
                                }`}
                              >
                                <span
                                  className="w-5 h-5 rounded-full border border-slate-300 shrink-0"
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
                            className="w-11 h-11 text-slate-300 hover:text-white hover:bg-slate-700 font-extrabold text-base flex items-center justify-center cursor-pointer"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={availableStock}
                            value={quantity}
                            onChange={(e) => setQuantity(Math.max(1, Math.min(availableStock, parseInt(e.target.value) || 1)))}
                            className="w-14 text-center bg-transparent text-white font-bold text-sm outline-none font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setQuantity((q) => Math.min(availableStock, q + 1))}
                            className="w-11 h-11 text-slate-300 hover:text-white hover:bg-slate-700 font-extrabold text-base flex items-center justify-center cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Selling Price Input Row */}
                    <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">৳</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          required
                          value={sellingPrice || ''}
                          onChange={(e) => setSellingPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-full h-11 pl-8 pr-3.5 text-base sm:text-xs bg-slate-800 border border-slate-700 rounded-xl text-white font-bold font-mono focus:ring-2 focus:ring-blue-500 outline-none"
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
                        <span className="text-sm font-bold text-white font-mono">৳{sellingPrice}</span>
                      </div>
                      <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                        <span className="text-[10px] text-slate-400 block">Total Amount (Customer Pays)</span>
                        <span className="text-sm font-bold text-blue-400 font-mono">৳{totalAmount}</span>
                      </div>
                      <div className="bg-emerald-950/60 p-2.5 rounded-xl border border-emerald-500/30">
                        <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-300" /> Your Profit / Commission
                        </span>
                        <span className={`text-sm font-bold font-mono ${sellAmount >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                          ৳{sellAmount}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Step 3: Customer Details Form */}
            <div className="space-y-4">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                2. Customer & Shipping Details <span className="text-rose-500">*</span>
              </label>

              {/* Auto Generated Fields Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Order Number (Auto)
                  </label>
                  <input
                    type="text"
                    disabled
                    value="SAT_ORD-XXXX (Auto-Generated)"
                    className="w-full h-10 px-3 text-xs bg-slate-100 border border-slate-200 rounded-lg text-slate-500 font-mono cursor-not-allowed"
                  />
                  <p className="text-[9px] text-slate-400 mt-1">Format: e.g. SAT_ORD-ASD4</p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Order Creator
                  </label>
                  <input
                    type="text"
                    disabled
                    value={user.fullName}
                    className="w-full h-10 px-3 text-xs bg-slate-100 border border-slate-200 rounded-lg text-slate-500 font-semibold cursor-not-allowed"
                  />
                  <p className="text-[9px] text-slate-400 mt-1">Automatically recorded creator name.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">Customer Full Name <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Rahat Ahmed"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full h-11 px-3.5 text-base sm:text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">Customer Phone Number <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 01712345678"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full h-11 px-3.5 text-base sm:text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Full Shipping Address <span className="text-rose-500">*</span></label>
                <textarea
                  rows={2}
                  placeholder="House, Road, Area, Thana, District"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full p-3.5 text-base sm:text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none min-h-[80px]"
                  required
                />
              </div>

              {/* Payment Status Selector */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Payment Status</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['unpaid', 'paid', 'partial'] as const).map((st) => (
                    <button
                      type="button"
                      key={st}
                      onClick={() => setPaymentStatus(st)}
                      className={`px-3 py-3 rounded-xl text-xs font-extrabold capitalize transition-all border cursor-pointer min-h-[44px] flex items-center justify-center ${
                        paymentStatus === st
                          ? st === 'paid'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : st === 'partial'
                            ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                            : 'bg-slate-800 text-white border-slate-800 shadow-sm'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Footer Actions */}
          <div className="sticky bottom-0 z-20 bg-slate-50 px-4 sm:px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-3 sm:py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm sm:text-xs rounded-xl transition-colors min-h-[44px] sm:min-h-[38px] flex items-center justify-center cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !isOnline || (isCartMode ? (!cartItems || cartItems.length === 0) : (!selectedProduct || availableStock < 1))}
              className="px-6 py-3 sm:py-2.5 text-sm sm:text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer active:scale-98 min-h-[44px] sm:min-h-[38px] disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Placing Order...</span>
                </>
              ) : !isOnline ? (
                <>
                  <WifiOff className="w-4 h-4" />
                  <span>Offline - Connection Required</span>
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
