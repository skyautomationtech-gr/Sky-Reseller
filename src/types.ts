export type UserRole = 'super_admin' | 'admin' | 'reseller';

export type UserStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface PayoutMethod {
  id: string;
  type: 'bKash' | 'Nagad' | 'Bank';
  accountNumber: string;
  accountHolderName?: string | null;
  bankName?: string | null;
  isDefault: boolean;
  verified: boolean;
  addedAt: any;
}

export interface NotificationPreferences {
  newOrder: boolean;
  payout: boolean;
  commission: boolean;
  importantNotice: boolean;
  appUpdate: boolean;
  promotional: boolean;
  sound: boolean;
  vibration: boolean;
}

export interface UserProfile {
  uid: string;
  fullName: string;
  shopName: string;
  mobile: string;
  email: string;
  division: string;
  district: string;
  upazila: string;
  address: string;
  profilePhotoUrl: string;
  shopPhotoUrl: string;
  nidUrl?: string;
  nidNumber?: string;
  bankName?: string;
  accountNumber?: string;
  accountHolderName?: string;
  branchName?: string;
  bkashNumber?: string;
  nagadNumber?: string;
  rocketNumber?: string;
  payoutMethod?: 'bkash' | 'nagad' | 'rocket' | 'bank';
  payoutMethods?: PayoutMethod[];
  customCommissionRate?: number;
  adminNotes?: string;
  role: UserRole;
  status: UserStatus;
  rejectReason?: string | null;
  plainPassword?: string;
  lastSeenVersion?: string;
  appLockEnabled?: boolean;
  appLockPinHash?: string | null;
  appLockPinLength?: number;
  notificationPreferences?: NotificationPreferences;
  fcmTokens?: string[];
  createdAt: any; // Firestore Timestamp or Date
}

export interface PayoutChangeRequest {
  id: string;
  resellerId: string;
  resellerName: string;
  shopName: string;
  mobile: string;
  payoutMethod: 'bkash' | 'nagad' | 'rocket' | 'bank';
  bkashNumber?: string;
  nagadNumber?: string;
  rocketNumber?: string;
  bankName?: string;
  accountNumber?: string;
  accountHolderName?: string;
  branchName?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  createdAt: any;
  approvedAt?: any;
  approvedBy?: string;
}

export interface GeoData {
  [division: string]: {
    [district: string]: string[];
  };
}

export interface Category {
  id: string;
  name: string;
  imageUrl?: string;
  status: 'active' | 'inactive';
  createdAt: any;
}

export interface Brand {
  id: string;
  name: string;
  logoUrl?: string;
  status: 'active' | 'inactive';
  createdAt: any;
}

export interface ProductMedia {
  url: string;
  path: string;
  isCover?: boolean;
  uploadedAt?: any;
}

export interface ProductVideoMedia {
  url: string;
  path: string;
  uploadedAt?: any;
}

export interface ProductVariant {
  id: string;
  colorName: string;
  colorSwatchUrl?: string;
  images: ProductMedia[];
  stock: number;
  priceAdjustment: number;
  sku: string;
  status: 'active' | 'inactive';
}

export interface Product {
  id: string;
  sku: string;
  barcodeValue: string;
  qrValue: string;
  categoryId: string;
  categoryName: string;
  brandId: string;
  brandName: string;
  name: string;
  costPrice: number;
  resellerPrice: number;
  retailPrice: number;
  stock: number;
  lowStockThreshold: number;
  warranty: string;
  description: string;
  images: ProductMedia[];
  videos: ProductVideoMedia[];
  hasVariants?: boolean;
  variants?: ProductVariant[];
  status: 'active' | 'inactive' | 'deleted';
  createdAt: any;
  updatedAt?: any;
}

export type OrderStatus = 'pending' | 'accepted' | 'packing' | 'ready_to_ship' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
export type OrderPaymentStatus = 'unpaid' | 'paid' | 'partial';

export interface Order {
  id: string;
  orderNumber: string;
  resellerId: string;
  resellerName: string;
  resellerShopName: string;
  productId: string;
  productName: string;
  productImage?: string;
  categoryId?: string;
  variantId?: string | null;
  variantColorName?: string | null;
  quantity: number;
  unitRetailPrice: number;
  unitResellerPrice: number;
  suggestedRetailPrice?: number;
  sellingPrice?: number;
  totalAmount: number;
  sellAmount: number;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  invoiceNumber?: string;
  invoiceGeneratedAt?: any;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  createdAt: any;
  updatedAt: any;
  specialInstructions?: string;
  deliveryPreference?: 'standard' | 'express' | 'same_day' | string;
  giftWrap?: boolean;
  messageCard?: string | null;
  customizations?: Record<string, any>;
  deliveryCost?: number;
  giftWrapCost?: number;
}

export interface Wallet {
  resellerId: string;
  balance: number;
  totalEarned: number;
  totalWithdrawn: number;
  updatedAt: any;
}

export type TransactionType = 'commission' | 'withdrawal' | 'adjustment' | 'deposit';
export type TransactionStatus = 'pending' | 'approved' | 'rejected';
export type PaymentMethod = 'bkash' | 'nagad' | 'bank_transfer';

export interface WalletTransaction {
  id: string;
  resellerId: string;
  resellerName?: string;
  resellerShopName?: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  orderId?: string | null;
  orderNumber?: string | null;
  paymentMethod?: PaymentMethod | null;
  accountNumber?: string | null;
  transactionId?: string | null;
  rejectReason?: string | null;
  createdAt: any;
  updatedAt?: any;
}

export type CommissionType = 'sell_amount' | 'percentage' | 'fixed';

export interface CategoryCommissionOverride {
  categoryId: string;
  categoryName: string;
  commissionType: CommissionType;
  value: number;
}

export interface CommissionSettings {
  id?: string;
  defaultType: CommissionType;
  percentageValue: number;
  fixedValue: number;
  monthlyBonusThresholdOrders: number;
  monthlyBonusAmount: number;
  categoryOverrides?: CategoryCommissionOverride[];
  updatedAt?: any;
}

// Phase 5 Types
export type NoticeType = 'new_product' | 'offer' | 'holiday_notice' | 'maintenance' | 'payment_notice';
export type NoticeAudience = 'all' | 'specific';

export interface Notice {
  id: string;
  type: NoticeType;
  title: string;
  message: string;
  targetAudience: NoticeAudience;
  targetResellerId?: string | null;
  targetResellerName?: string | null;
  publishedBy: string;
  publishedByName?: string;
  createdAt: any;
}

export interface NoticeRead {
  id: string;
  noticeId: string;
  resellerId: string;
  readAt: any;
}

export type TicketCategory = 
  | 'Order Issue' 
  | 'Payment Issue' 
  | 'Product Quality Issue' 
  | 'Account Issue' 
  | 'Delivery Problem' 
  | 'Commission Question' 
  | 'App Bug/Technical' 
  | 'Other';

export type TicketPriority = 'low' | 'medium' | 'high';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface TicketReply {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  message: string;
  createdAt: any;
}

export interface SupportTicket {
  id: string;
  ticketId: string;
  resellerId: string;
  resellerName: string;
  resellerShopName?: string;
  category: TicketCategory | string;
  subject: string;
  description: string;
  orderId?: string | null;
  orderNumber?: string | null;
  priority: TicketPriority;
  attachmentUrl?: string | null;
  email: string;
  status: TicketStatus;
  replies?: TicketReply[];
  createdAt: any;
  updatedAt: any;
}

export interface AuditLog {
  id: string;
  action: string;
  performedBy: string;
  performedByName: string;
  performedByRole: UserRole;
  targetId?: string | null;
  details: string;
  timestamp: any;
}

export interface UserLoginSession {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  deviceInfo: string;
  timestamp: any;
}

export interface CompanySettings {
  companyName: string;
  logoUrl?: string;
  bannerImages?: string[];
  address: string;
  phoneNumbers: string;
  email: string;
  currencySymbol: string;
  vatPercentage: number;
  defaultDeliveryCharge: number;
  updatedAt?: any;
}

export type ReleaseType = 'major' | 'minor' | 'patch' | 'hotfix';

export interface ChangelogEntry {
  id: string;
  version: string;
  title: string;
  description: string;
  releaseType: ReleaseType;
  publishedAt: any;
  publishedBy: string;
  publishedByName?: string;
}

export interface AppVersionConfig {
  version: string;
  releasedAt: any;
  releaseNotes?: string;
}

export interface CartItem {
  id: string; // generated client-side: e.g. productId_variantId
  product: Product;
  variant: ProductVariant | null;
  quantity: number;
  sellingPrice: number; // custom reseller-defined price
}

export interface ProductReview {
  id: string;
  productId: string;
  productName?: string;
  productImage?: string;
  resellerId: string;
  resellerName: string;
  rating: number;
  title: string;
  description: string;
  imageUrl?: string | null;
  createdAt: any;
  updatedAt: any;
}

export type FeedbackType = 'Complaint' | 'Suggestion/Feedback' | 'Bug Report' | 'Feature Request';
export type BugSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export interface ResellerFeedback {
  id: string;
  refId: string;
  resellerId: string;
  resellerName: string;
  resellerShopName?: string;
  type: FeedbackType;
  category: string;
  title: string;
  message: string;
  attachmentUrls: string[];
  severity?: BugSeverity | null;
  status: 'new' | 'reviewed' | 'in_progress' | 'resolved' | 'closed';
  email: string;
  adminNotes?: string;
  createdAt: any;
  updatedAt: any;
}

export type WithdrawalPaymentMethod = 'bKash' | 'Nagad' | 'Rocket' | 'Bank Transfer';
export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface WithdrawalRequest {
  id: string;
  requestId: string;
  resellerId: string;
  resellerName: string;
  resellerShopName?: string;
  amount: number;
  paymentMethod: WithdrawalPaymentMethod;
  accountDetails: string;
  accountHolderName?: string | null;
  bankName?: string | null;
  proofUrl?: string | null;
  status: WithdrawalStatus;
  requestedAt: any;
  processedAt?: any | null;
  notes?: string | null;
  transactionId?: string | null;
}




