/**
 * Standalone Admin Migration Script for ReSellBD Shop Names
 * 
 * Purpose:
 * 1. Reads all existing resellers in the Firestore database.
 * 2. Normalizes shop names (Unicode-aware for English & Bengali, collapses spaces, removes punctuation).
 * 3. Identifies duplicates without modifying or deleting anything.
 * 4. For unique resellers, sets `shopNameKey` on the user doc and reserves `shopNames/{shopNameKey}`.
 * 5. Prints a comprehensive report of migrated resellers and any duplicate conflicts for manual resolution.
 * 
 * How to run:
 *   node scripts/migrate-shop-names.mjs
 */

import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore, collection, getDocs, doc, writeBatch, serverTimestamp 
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load firebase-applet-config.json
const configPath = path.resolve(__dirname, '../firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Normalization function matching application rules
function normalizeShopName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

async function runMigration() {
  console.log('=====================================================');
  console.log('   ReSellBD Shop Name Uniqueness & Reservation Migration');
  console.log('=====================================================\n');
  console.log(`Target Project: ${firebaseConfig.projectId}`);
  console.log(`Database ID:    ${firebaseConfig.firestoreDatabaseId || '(default)'}\n`);

  const app = initializeApp(firebaseConfig);
  const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  }, firebaseConfig.firestoreDatabaseId || undefined);

  console.log('Fetching users from Firestore...');
  const usersCol = collection(db, 'users');
  const snap = await getDocs(usersCol);

  const resellers = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data.role === 'reseller' || data.shopName) {
      resellers.push({
        uid: d.id,
        resellerId: data.resellerId || data.resellerCode || d.id,
        shopName: (data.shopName || '').trim(),
        email: data.email || 'no-email',
        currentKey: data.shopNameKey || '',
      });
    }
  });

  console.log(`Found ${resellers.length} reseller/shop user documents.\n`);

  // Group by normalized shop name key
  const groups = new Map();
  let missingNameCount = 0;

  for (const r of resellers) {
    if (!r.shopName) {
      missingNameCount++;
      continue;
    }
    const key = normalizeShopName(r.shopName);
    if (!key) {
      missingNameCount++;
      continue;
    }
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(r);
  }

  const duplicates = [];
  const uniqueList = [];

  for (const [key, list] of groups.entries()) {
    if (list.length > 1) {
      duplicates.push({
        shopNameKey: key,
        rawShopName: list[0].shopName,
        resellers: list.map((item) => ({
          uid: item.uid,
          resellerId: item.resellerId,
          email: item.email,
          shopName: item.shopName,
        })),
      });
    } else {
      uniqueList.push({
        key,
        reseller: list[0],
      });
    }
  }

  // 1. REPORT DUPLICATES FIRST (DO NOT MODIFY)
  if (duplicates.length > 0) {
    console.warn('⚠️  DUPLICATE SHOP NAMES DETECTED:');
    console.warn('   Per requirements, NO duplicate accounts were modified or renamed.');
    console.warn('   Please review and resolve the following duplicates manually:\n');

    duplicates.forEach((dup, index) => {
      console.warn(`[Conflict #${index + 1}] Normalized Key: "${dup.shopNameKey}"`);
      dup.resellers.forEach((r) => {
        console.warn(`   - Reseller ID: ${r.resellerId} | UID: ${r.uid} | Email: ${r.email} | Name: "${r.shopName}"`);
      });
      console.warn('');
    });
  } else {
    console.log('✅ No duplicate shop names detected among existing resellers.');
  }

  // 2. MIGRATE UNIQUE RESELLERS
  console.log(`Preparing to migrate ${uniqueList.length} unique resellers...`);

  let migratedCount = 0;
  const BATCH_SIZE = 200;

  for (let i = 0; i < uniqueList.length; i += BATCH_SIZE) {
    const chunk = uniqueList.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const item of chunk) {
      const { key, reseller } = item;

      // Create reservation in shopNames/{shopNameKey}
      const reservationRef = doc(db, 'shopNames', key);
      batch.set(reservationRef, {
        uid: reseller.uid,
        shopName: reseller.shopName,
        shopNameKey: key,
        createdAt: serverTimestamp(),
      }, { merge: true });

      // Update user doc with shopNameKey
      const userRef = doc(db, 'users', reseller.uid);
      batch.update(userRef, {
        shopNameKey: key,
        updatedAt: serverTimestamp(),
      });
    }

    try {
      await batch.commit();
      migratedCount += chunk.length;
      console.log(`Processed batch ${Math.min(i + BATCH_SIZE, uniqueList.length)} / ${uniqueList.length}`);
    } catch (batchErr) {
      console.error('Error committing migration batch:', batchErr.message);
    }
  }

  console.log('\n=====================================================');
  console.log('               Migration Summary');
  console.log('=====================================================');
  console.log(`Total Resellers Scanned: ${resellers.length}`);
  console.log(`Successfully Migrated:   ${migratedCount}`);
  console.log(`Duplicate Groups:        ${duplicates.length}`);
  console.log(`Missing Shop Names:      ${missingNameCount}`);
  console.log('=====================================================\n');

  if (duplicates.length > 0) {
    console.log('JSON Representation of Duplicates for Admin Review:');
    console.log(JSON.stringify(duplicates, null, 2));
  }

  process.exit(0);
}

runMigration().catch((err) => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
