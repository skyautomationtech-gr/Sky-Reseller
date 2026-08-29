import * as XLSX from 'xlsx';
import { Product, ProductVariant, Brand, Category } from '../types';

export interface ParsedProductRow {
  rowIndex: number;
  raw: Record<string, any>;
  productId?: string;
  sku: string;
  name: string;
  categoryName: string;
  mainCategory?: string;
  subCategory?: string;
  childCategory?: string;
  brandName: string;
  subBrand?: string;
  costPrice: number;
  sellingPrice: number; // reseller price
  retailPrice: number;
  stock: number;
  lowStockThreshold: number;
  warranty: string;
  description: string;
  barcodeValue: string;
  variantsText?: string;
  variants: ProductVariant[];
  hasVariants: boolean;
  status: 'active' | 'inactive';
  isValid: boolean;
  isUpdate: boolean;
  matchedExistingId?: string;
  errors: string[];
  warnings: string[];
}

export interface ParsedBrandRow {
  rowIndex: number;
  raw: Record<string, any>;
  brandId?: string;
  name: string;
  associatedSubBrands?: string[];
  associatedCategories?: string[];
  logoUrl?: string;
  status: 'active' | 'inactive';
  isValid: boolean;
  isUpdate: boolean;
  matchedExistingId?: string;
  errors: string[];
  warnings: string[];
}

/**
 * Normalizes header keys by lowercasing, removing spaces, punctuation, and currency symbols
 */
export function normalizeHeader(header: string): string {
  return String(header || '')
    .toLowerCase()
    .replace(/[৳$₹¥€()\[\]\-_/\\.,:;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse variant strings like:
 * "Color / Model (Stock: N, Barcode: XYZ)"
 * "Black (Stock: 10, Barcode: 890123), Silver (Stock: 15, Barcode: 890124)"
 * "Red: 10, Blue: 20"
 * "White (5), Black (10)"
 */
export function parseVariantsString(variantStr: string, baseSku: string): ProductVariant[] {
  if (!variantStr || typeof variantStr !== 'string' || !variantStr.trim()) {
    return [];
  }

  const rawText = variantStr.trim();

  // Try JSON parsing first
  if ((rawText.startsWith('[') && rawText.endsWith(']')) || (rawText.startsWith('{') && rawText.endsWith('}'))) {
    try {
      const parsed = JSON.parse(rawText);
      if (Array.isArray(parsed)) {
        return parsed.map((item, idx) => ({
          id: item.id || `var_${Date.now()}_${idx}`,
          colorName: item.colorName || item.name || item.color || `Variant ${idx + 1}`,
          stock: parseInt(item.stock, 10) || 0,
          priceAdjustment: parseFloat(item.priceAdjustment) || 0,
          sku: item.sku || `${baseSku}-V${idx + 1}`,
          status: item.status === 'inactive' ? 'inactive' : 'active',
          images: []
        }));
      }
    } catch {
      // fallback to string parsing
    }
  }

  const variants: ProductVariant[] = [];
  // Split by comma or semicolon or newline (unless inside parentheses)
  const segments = rawText.split(/(?:;|\n|,(?![^(]*\)))/).map(s => s.trim()).filter(Boolean);

  segments.forEach((seg, idx) => {
    // Pattern 1: "Color / Model (Stock: 10, Barcode: 890123)" or "Black (Stock: 10)"
    const stockBarcodeMatch = seg.match(/^([^()]+)\((?:.*stock[:=\s]*([0-9]+))?(?:.*barcode[:=\s]*([0-9a-zA-Z_-]+))?.*\)$/i);
    // Pattern 2: "Black (10)" or "Red (5)"
    const simpleParenMatch = seg.match(/^([^()]+)\(([0-9]+)\)$/);
    // Pattern 3: "Black: 10" or "Red = 5"
    const colonMatch = seg.match(/^([^:=]+)[:=]\s*([0-9]+)$/);

    let colorName = seg;
    let stock = 0;

    if (stockBarcodeMatch) {
      colorName = stockBarcodeMatch[1].trim();
      if (stockBarcodeMatch[2]) {
        stock = parseInt(stockBarcodeMatch[2], 10) || 0;
      }
    } else if (simpleParenMatch) {
      colorName = simpleParenMatch[1].trim();
      stock = parseInt(simpleParenMatch[2], 10) || 0;
    } else if (colonMatch) {
      colorName = colonMatch[1].trim();
      stock = parseInt(colonMatch[2], 10) || 0;
    }

    if (colorName) {
      variants.push({
        id: `var_${Date.now()}_${idx}`,
        colorName,
        stock: isNaN(stock) ? 0 : Math.max(0, stock),
        priceAdjustment: 0,
        sku: `${baseSku || 'SKU'}-V${idx + 1}`,
        status: 'active',
        images: []
      });
    }
  });

  return variants;
}

/**
 * Reads a File object and parses it into JSON rows using xlsx
 */
export async function readFileToRows(file: File): Promise<{ rows: Record<string, any>[]; headers: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          throw new Error('The uploaded file does not contain any sheets.');
        }

        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

        if (rawJson.length === 0) {
          resolve({ rows: [], headers: [] });
          return;
        }

        const headers = Object.keys(rawJson[0]);
        resolve({ rows: rawJson, headers });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
}

/**
 * Matches a row's key against a list of possible normalized aliases
 */
function findRowValue(row: Record<string, any>, aliases: string[]): any {
  const rowEntries = Object.entries(row);
  for (const [key, val] of rowEntries) {
    const normKey = normalizeHeader(key);
    for (const alias of aliases) {
      if (normKey === alias || normKey.includes(alias)) {
        return val;
      }
    }
  }
  return '';
}

/**
 * Parses and validates raw product rows from CSV/Excel against existing products
 */
export function processProductImportRows(
  rawRows: Record<string, any>[],
  existingProducts: Product[]
): ParsedProductRow[] {
  const existingSkuMap = new Map<string, Product>();
  const existingIdMap = new Map<string, Product>();

  existingProducts.forEach(p => {
    if (p.sku) existingSkuMap.set(p.sku.trim().toLowerCase(), p);
    if (p.id) existingIdMap.set(p.id.trim(), p);
  });

  return rawRows.map((raw, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Extract values with flexible alias matching
    const rawId = String(findRowValue(raw, ['product id', 'item id', 'id', 'doc id']) || '').trim();
    let rawSku = String(findRowValue(raw, ['sku', 'product sku', 'item sku', 'code', 'item code']) || '').trim();
    const rawName = String(findRowValue(raw, ['product name', 'name', 'title', 'item name', 'product']) || '').trim();
    
    // Categories
    const categoryName = String(findRowValue(raw, ['category', 'category name', 'main category', 'maincategory']) || 'General').trim();
    const mainCategory = String(findRowValue(raw, ['main category', 'maincategory']) || '').trim();
    const subCategory = String(findRowValue(raw, ['sub category', 'subcategory']) || '').trim();
    const childCategory = String(findRowValue(raw, ['child category', 'childcategory']) || '').trim();

    // Brand
    const brandName = String(findRowValue(raw, ['brand', 'brand name', 'manufacturer']) || 'Generic').trim();
    const subBrand = String(findRowValue(raw, ['sub brand', 'subbrand']) || '').trim();

    // Financials
    const rawCostPrice = findRowValue(raw, ['cost price', 'cost', 'buy price', 'purchase price']);
    const rawSellingPrice = findRowValue(raw, ['selling price', 'reseller price', 'wholesale price', 'price']);
    const rawRetailPrice = findRowValue(raw, ['retail price', 'mrp', 'regular price', 'market price']);

    // Stock & Threshold
    const rawStock = findRowValue(raw, ['total stock', 'stock', 'quantity', 'qty', 'inventory']);
    const rawLowStock = findRowValue(raw, ['low stock threshold', 'threshold', 'low stock alert', 'min stock', 'alert threshold']);
    const rawStatus = String(findRowValue(raw, ['stock status', 'status', 'product status', 'availability']) || 'active').trim();

    // Extra
    const rawBarcode = String(findRowValue(raw, ['barcode value', 'barcode', 'bar code', 'upc', 'ean']) || '').trim();
    const rawWarranty = String(findRowValue(raw, ['warranty', 'guarantee']) || '6 Months').trim();
    const rawDescription = String(findRowValue(raw, ['description', 'details', 'specs', 'notes']) || '').trim();
    const rawVariantsText = String(findRowValue(raw, ['variants breakdown', 'variants', 'variant list', 'options', 'colors']) || '').trim();

    // Auto-generate SKU if missing
    if (!rawSku) {
      if (rawName) {
        const slug = rawName.slice(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
        rawSku = `SAT-${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
        warnings.push(`SKU was missing; auto-generated as "${rawSku}".`);
      } else {
        rawSku = `SAT-ITEM-${index + 1}`;
      }
    }

    // Validate Name
    if (!rawName) {
      errors.push('Product Name is required.');
    }

    // Numeric conversions
    const costPrice = parseFloat(String(rawCostPrice).replace(/[^0-9.]/g, '')) || 0;
    const sellingPrice = parseFloat(String(rawSellingPrice).replace(/[^0-9.]/g, '')) || 0;
    let retailPrice = parseFloat(String(rawRetailPrice).replace(/[^0-9.]/g, '')) || 0;

    if (sellingPrice <= 0 && rawSellingPrice !== '') {
      warnings.push('Selling price is 0 or invalid.');
    }

    if (retailPrice <= 0) {
      retailPrice = sellingPrice > 0 ? Math.round(sellingPrice * 1.25) : 0;
      if (sellingPrice > 0) {
        warnings.push(`Retail price was missing; defaulted to ৳${retailPrice}.`);
      }
    }

    let parsedStock = parseInt(String(rawStock).replace(/[^0-9-]/g, ''), 10);
    if (isNaN(parsedStock) || parsedStock < 0) {
      parsedStock = 10;
      warnings.push('Stock was invalid or missing; set to default 10.');
    }

    const lowStockThreshold = parseInt(String(rawLowStock).replace(/[^0-9]/g, ''), 10) || 5;

    // Parse Variants
    const variants = parseVariantsString(rawVariantsText, rawSku);
    const hasVariants = variants.length > 0;

    let finalStock = parsedStock;
    if (hasVariants) {
      const variantTotalStock = variants.reduce((sum, v) => sum + (v.stock || 0), 0);
      if (variantTotalStock > 0) {
        finalStock = variantTotalStock;
      }
    }

    // Determine status
    let status: 'active' | 'inactive' = 'active';
    const normStatus = rawStatus.toLowerCase();
    if (normStatus === 'inactive' || normStatus === 'out of stock' || normStatus === 'disabled' || normStatus === '0') {
      status = 'inactive';
    }

    // Check if Product is Upsert/Update
    let isUpdate = false;
    let matchedExistingId: string | undefined = undefined;

    if (rawId && existingIdMap.has(rawId)) {
      isUpdate = true;
      matchedExistingId = rawId;
    } else if (existingSkuMap.has(rawSku.toLowerCase())) {
      isUpdate = true;
      matchedExistingId = existingSkuMap.get(rawSku.toLowerCase())?.id;
    }

    return {
      rowIndex: index + 2, // 1-based index plus header
      raw,
      productId: rawId,
      sku: rawSku,
      name: rawName,
      categoryName: categoryName || 'General',
      mainCategory,
      subCategory,
      childCategory,
      brandName: brandName || 'Generic',
      subBrand,
      costPrice,
      sellingPrice,
      retailPrice,
      stock: finalStock,
      lowStockThreshold,
      warranty: rawWarranty || '6 Months',
      description: rawDescription || '',
      barcodeValue: rawBarcode || `890${Math.floor(100000000 + Math.random() * 900000000)}`,
      variantsText: rawVariantsText,
      variants,
      hasVariants,
      status,
      isValid: errors.length === 0,
      isUpdate,
      matchedExistingId,
      errors,
      warnings
    };
  });
}

/**
 * Parses and validates raw brand rows from CSV/Excel against existing brands
 */
export function processBrandImportRows(
  rawRows: Record<string, any>[],
  existingBrands: Brand[]
): ParsedBrandRow[] {
  const existingNameMap = new Map<string, Brand>();
  const existingIdMap = new Map<string, Brand>();

  existingBrands.forEach(b => {
    if (b.name) existingNameMap.set(b.name.trim().toLowerCase(), b);
    if (b.id) existingIdMap.set(b.id.trim(), b);
  });

  const fileSeenNames = new Set<string>();

  return rawRows.map((raw, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const rawId = String(findRowValue(raw, ['brand id', 'id', 'doc id']) || '').trim();
    const rawName = String(findRowValue(raw, ['brand name', 'name', 'brand']) || '').trim();
    const rawSubBrands = String(findRowValue(raw, ['associated sub-brands', 'sub-brands', 'sub brands', 'subbrand']) || '').trim();
    const rawCategories = String(findRowValue(raw, ['associated categories', 'categories', 'category', 'category name']) || '').trim();
    const rawLogo = String(findRowValue(raw, ['logo url', 'logo', 'image', 'photo']) || '').trim();
    const rawStatus = String(findRowValue(raw, ['status', 'brand status']) || 'active').trim();

    if (!rawName) {
      errors.push('Brand Name is required.');
    }

    const normName = rawName.toLowerCase();
    if (normName && fileSeenNames.has(normName)) {
      warnings.push(`Duplicate brand "${rawName}" in this file; will be merged/updated.`);
    } else if (normName) {
      fileSeenNames.add(normName);
    }

    const subBrandsList = rawSubBrands
      ? rawSubBrands.split(/[,;\n|]/).map(s => s.trim()).filter(Boolean)
      : [];

    const categoriesList = rawCategories
      ? rawCategories.split(/[,;\n|]/).map(s => s.trim()).filter(Boolean)
      : [];

    let isUpdate = false;
    let matchedExistingId: string | undefined = undefined;

    if (rawId && existingIdMap.has(rawId)) {
      isUpdate = true;
      matchedExistingId = rawId;
    } else if (existingNameMap.has(normName)) {
      isUpdate = true;
      matchedExistingId = existingNameMap.get(normName)?.id;
    }

    let status: 'active' | 'inactive' = 'active';
    if (rawStatus.toLowerCase() === 'inactive' || rawStatus === '0') {
      status = 'inactive';
    }

    return {
      rowIndex: index + 2,
      raw,
      brandId: rawId,
      name: rawName,
      associatedSubBrands: subBrandsList,
      associatedCategories: categoriesList,
      logoUrl: rawLogo,
      status,
      isValid: errors.length === 0,
      isUpdate,
      matchedExistingId,
      errors,
      warnings
    };
  });
}

/**
 * Generates and triggers download of a sample CSV/XLSX template for Products
 */
export function downloadSampleProductTemplate(format: 'csv' | 'xlsx' = 'xlsx') {
  const sampleData = [
    {
      'Product ID': '',
      'SKU': 'SAT-EAR-8801',
      'Product Name': 'KZ Castor Dual Dynamic Driver Earphone',
      'Category': 'Wired Earphones',
      'Main Category': 'Audio & Sound',
      'Sub Category': 'In-Ear Monitors',
      'Child Category': 'Audiophile',
      'Brand': 'KZ',
      'Sub-Brand': 'Acoustics',
      'Cost Price (৳)': 1450,
      'Selling Price (৳)': 1750,
      'Retail Price (৳)': 2150,
      'Total Stock': 50,
      'Low Stock Threshold': 10,
      'Stock Status': 'In Stock',
      'Variants Breakdown': 'Silver / Harman Target (Stock: 25, Barcode: 890123456789), Black / Bass Enhanced (Stock: 25, Barcode: 890123456790)',
      'Barcode Value': '890123456789',
      'Description': 'Premium Harman Curve tuning with adjustable tuning switches and 2DD acoustic system.'
    },
    {
      'Product ID': '',
      'SKU': 'SAT-WATCH-9902',
      'Product Name': 'T900 Ultra 2 Smartwatch HD Display',
      'Category': 'Smart Gadgets',
      'Main Category': 'Wearables',
      'Sub Category': 'Smartwatches',
      'Child Category': 'Bluetooth Calling',
      'Brand': 'SAT AI',
      'Sub-Brand': 'Ultra Series',
      'Cost Price (৳)': 650,
      'Selling Price (৳)': 850,
      'Retail Price (৳)': 1250,
      'Total Stock': 80,
      'Low Stock Threshold': 15,
      'Stock Status': 'In Stock',
      'Variants Breakdown': 'Orange Strap (Stock: 30), Black Strap (Stock: 30), Silver Strap (Stock: 20)',
      'Barcode Value': '890987654321',
      'Description': '2.09-inch HD infinite display with Bluetooth calling, wireless charging, and sports modes.'
    },
    {
      'Product ID': '',
      'SKU': 'SAT-PB-5503',
      'Product Name': 'Hoco J86 Powermaster 40000mAh Power Bank 22.5W',
      'Category': 'Power & Charging',
      'Main Category': 'Mobile Accessories',
      'Sub Category': 'Power Banks',
      'Child Category': 'Fast Charging',
      'Brand': 'Hoco',
      'Sub-Brand': 'Powermaster',
      'Cost Price (৳)': 2200,
      'Selling Price (৳)': 2550,
      'Retail Price (৳)': 3100,
      'Total Stock': 35,
      'Low Stock Threshold': 8,
      'Stock Status': 'In Stock',
      'Variants Breakdown': 'Black (Stock: 20), White (Stock: 15)',
      'Barcode Value': '890555666777',
      'Description': 'Massive 40000mAh capacity with PD 20W / QC 22.5W dual fast output and LED desk lamp.'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

  const filename = `Sky_Reseller_Products_Import_Template.${format}`;
  XLSX.writeFile(workbook, filename, { bookType: format });
}

/**
 * Generates and triggers download of a sample CSV/XLSX template for Brands
 */
export function downloadSampleBrandTemplate(format: 'csv' | 'xlsx' = 'xlsx') {
  const sampleData = [
    {
      'Brand ID': '',
      'Brand Name': 'KZ',
      'Associated Sub-Brands': 'KZ Acoustics, CCA, GK',
      'Associated Categories': 'Wired Earphones, Bluetooth Adapters, Earphone Cables',
      'Logo URL': 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=200&auto=format&fit=crop&q=80',
      'Status': 'active'
    },
    {
      'Brand ID': '',
      'Brand Name': 'Hoco',
      'Associated Sub-Brands': 'Borofone, Hoco Premium',
      'Associated Categories': 'Power & Charging, Audio, Cables, Car Accessories',
      'Logo URL': 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=200&auto=format&fit=crop&q=80',
      'Status': 'active'
    },
    {
      'Brand ID': '',
      'Brand Name': 'Awei',
      'Associated Sub-Brands': 'Awei Gaming',
      'Associated Categories': 'Wireless Neckbands, TWS Earbuds, Power Banks',
      'Logo URL': '',
      'Status': 'active'
    },
    {
      'Brand ID': '',
      'Brand Name': 'Joyroom',
      'Associated Sub-Brands': 'Joyroom JR Series',
      'Associated Categories': 'Chargers, Car Mounts, TWS Earbuds',
      'Logo URL': '',
      'Status': 'active'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Brands');

  const filename = `Sky_Reseller_Brands_Import_Template.${format}`;
  XLSX.writeFile(workbook, filename, { bookType: format });
}
