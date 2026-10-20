/**
 * Bangladesh Geocode Service
 * Provides access to Bangladesh administrative boundaries:
 * 8 Divisions, 64 Districts, 494 Upazilas, 4,540 Unions
 * Source: nuhil/bangladesh-geocode (Open Source Bangladesh administrative boundary dataset)
 */

export interface BdDivision {
  id: string;
  name: string;
  bn_name: string;
}

export interface BdDistrict {
  id: string;
  division_id: string;
  name: string;
  bn_name: string;
}

export interface BdUpazila {
  id: string;
  district_id: string;
  name: string;
  bn_name: string;
}

export interface BdUnion {
  id: string;
  upazila_id: string;
  name: string;
  bn_name: string;
}

// In-memory cache for fast lookups
let cachedDivisions: BdDivision[] | null = null;
let cachedDistricts: BdDistrict[] | null = null;
let cachedUpazilas: BdUpazila[] | null = null;
let cachedUnions: BdUnion[] | null = null;

export async function getDivisions(): Promise<BdDivision[]> {
  if (cachedDivisions) return cachedDivisions;
  const mod = await import('./divisions.json');
  cachedDivisions = (mod.default || mod) as BdDivision[];
  return cachedDivisions;
}

export async function getDistricts(divisionId?: string): Promise<BdDistrict[]> {
  if (!cachedDistricts) {
    const mod = await import('./districts.json');
    cachedDistricts = (mod.default || mod) as BdDistrict[];
  }
  if (!divisionId) return cachedDistricts;
  return cachedDistricts.filter((d) => d.division_id === divisionId);
}

export async function getUpazilas(districtId?: string): Promise<BdUpazila[]> {
  if (!cachedUpazilas) {
    const mod = await import('./upazilas.json');
    cachedUpazilas = (mod.default || mod) as BdUpazila[];
  }
  if (!districtId) return cachedUpazilas;
  return cachedUpazilas.filter((u) => u.district_id === districtId);
}

export async function getUnions(upazilaId?: string): Promise<BdUnion[]> {
  if (!cachedUnions) {
    const mod = await import('./unions.json');
    cachedUnions = (mod.default || mod) as BdUnion[];
  }
  if (!upazilaId) return cachedUnions;
  return cachedUnions.filter((u) => u.upazila_id === upazilaId);
}
