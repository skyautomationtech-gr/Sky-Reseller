import { Product, ProductMedia, ProductVideoMedia } from '../types';

/**
 * Safely normalizes product data coming from Firebase Firestore.
 * Supports products created in Sky Reseller as well as synced products
 * uploaded from Sky Inventory App.
 */
export function normalizeProduct(id: string, data: any): Product {
  if (!data) {
    return {
      id,
      sku: id,
      barcodeValue: id,
      qrValue: id,
      categoryId: '',
      categoryName: 'General',
      brandId: '',
      brandName: '',
      name: 'Product',
      costPrice: 0,
      resellerPrice: 0,
      retailPrice: 0,
      stock: 0,
      lowStockThreshold: 5,
      warranty: '',
      description: '',
      images: [],
      videos: [],
      hasVariants: false,
      variants: [],
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  // 1. Handle Images (strings vs ProductMedia objects)
  const rawImages = data.images || (data.imageUrl ? [data.imageUrl] : []) || (data.image ? [data.image] : []) || [];
  const imageArray = Array.isArray(rawImages) ? rawImages : [rawImages];
  const normalizedImages: ProductMedia[] = imageArray
    .filter(Boolean)
    .map((img: any, idx: number) => {
      if (typeof img === 'string') {
        return { url: img, path: '', isCover: idx === 0 };
      }
      return {
        url: img.url || img.src || '',
        path: img.path || '',
        isCover: img.isCover !== undefined ? img.isCover : idx === 0,
        uploadedAt: img.uploadedAt || null,
      };
    });

  // 2. Handle Videos
  const rawVideos = data.videos || (data.videoUrl ? [data.videoUrl] : []) || [];
  const videoArray = Array.isArray(rawVideos) ? rawVideos : [rawVideos];
  const normalizedVideos: ProductVideoMedia[] = videoArray
    .filter(Boolean)
    .map((vid: any) => {
      if (typeof vid === 'string') {
        return { url: vid, path: '' };
      }
      return {
        url: vid.url || '',
        path: vid.path || '',
        uploadedAt: vid.uploadedAt || null,
      };
    });

  // 3. Handle Price fallback mapping
  const rawResellerPrice = data.resellerPrice ?? data.wholesalePrice ?? data.price ?? data.costPrice ?? 0;
  const resellerPrice = Math.max(0, Number(rawResellerPrice) || 0);

  const rawRetailPrice = data.retailPrice ?? data.sellingPrice ?? (resellerPrice > 0 ? Math.round(resellerPrice * 1.25) : 0);
  const retailPrice = Math.max(resellerPrice, Number(rawRetailPrice) || 0);

  const rawCostPrice = data.costPrice ?? resellerPrice;
  const costPrice = Math.max(0, Number(rawCostPrice) || 0);

  // 4. Handle Stock
  const stock = Math.max(0, Number(data.stock ?? data.stockQuantity ?? data.quantity ?? 0));

  return {
    id,
    sku: data.sku || `SAT-PRD-${id.slice(0, 6).toUpperCase()}`,
    barcodeValue: data.barcodeValue || data.barcode || data.sku || id,
    qrValue: data.qrValue || id,
    categoryId: data.categoryId || 'general',
    categoryName: data.categoryName || data.category || 'General',
    brandId: data.brandId || '',
    brandName: data.brandName || '',
    name: data.name || 'Untitled Product',
    costPrice,
    resellerPrice,
    retailPrice,
    stock,
    lowStockThreshold: Number(data.lowStockThreshold ?? 5),
    warranty: data.warranty || '',
    description: data.description || '',
    images: normalizedImages,
    videos: normalizedVideos,
    hasVariants: Boolean(data.hasVariants),
    variants: Array.isArray(data.variants) ? data.variants : [],
    status: data.status || 'active',
    approvalStatus: data.approvalStatus || (data.isImported && !data.approvedAt ? 'pending' : 'approved'),
    isImported: Boolean(data.isImported),
    importBatchId: data.importBatchId || '',
    importFileName: data.importFileName || '',
    importedAt: data.importedAt || null,
    importedBy: data.importedBy || '',
    approvedAt: data.approvedAt || null,
    approvedBy: data.approvedBy || '',
    rejectReason: data.rejectReason || '',
    updatedAt: data.updatedAt || null,
    createdAt: data.createdAt || new Date().toISOString(),
  };
}
