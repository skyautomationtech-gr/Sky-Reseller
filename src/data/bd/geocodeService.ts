import {
  getAllDivisions,
  getDistrictsByDivision,
  getAllDistricts,
  getUpazilasByDistrict,
  getThanasByDistrict,
  getUnionsByUpazila,
  getCityCorporationsByDistrict,
  getWardsByCityCorporation,
} from 'bangladesh-geo-data';

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

export interface BdUpazilaThana {
  id: string;
  district_id: string;
  name: string;
  bn_name: string;
  isCity: boolean;
  type: 'upazila' | 'metropolitan';
  cityCorpId?: string;
  badge?: string;
}

export interface BdUnionWard {
  id: string;
  upazila_id?: string;
  name: string;
  bn_name: string;
  postOffice?: string;
  postalCode?: string;
  isWard?: boolean;
  wardNo?: number;
  cityCorpId?: string;
}

export async function getDivisions(): Promise<BdDivision[]> {
  const list = getAllDivisions();
  return list.map((d: any) => ({
    id: d.id,
    name: d.name,
    bn_name: d.nameBn,
  }));
}

export async function getDistricts(divisionId?: string): Promise<BdDistrict[]> {
  if (!divisionId) {
    const list = getAllDistricts();
    return list.map((d: any) => ({
      id: d.id,
      division_id: d.divisionId,
      name: d.name,
      bn_name: d.nameBn,
    }));
  }
  const list = getDistrictsByDivision(divisionId);
  return list.map((d: any) => ({
    id: d.id,
    division_id: d.divisionId,
    name: d.name,
    bn_name: d.nameBn,
  }));
}

export async function getUpazilasAndThanas(districtId?: string): Promise<BdUpazilaThana[]> {
  if (!districtId) return [];

  // Rural upazilas
  const upazilas = getUpazilasByDistrict(districtId) || [];
  // Thanas (rural and metropolitan)
  const thanas = getThanasByDistrict(districtId) || [];
  const metroThanas = thanas.filter((t: any) => t.type === 'metropolitan');

  const result: BdUpazilaThana[] = [];

  // Add rural upazilas
  upazilas.forEach((u: any) => {
    result.push({
      id: u.id,
      district_id: districtId,
      name: u.name,
      bn_name: u.nameBn,
      isCity: false,
      type: 'upazila',
    });
  });

  // Add metropolitan thanas (with City badge)
  metroThanas.forEach((t: any) => {
    const exists = result.some((r) => r.name.toLowerCase() === t.name.toLowerCase());
    let cityCorpId = t.cityCorpId;
    if (!cityCorpId) {
      const ccs = getCityCorporationsByDistrict(districtId);
      if (ccs && ccs.length > 0) cityCorpId = ccs[0].id;
    }
    if (!exists) {
      result.push({
        id: t.id,
        district_id: districtId,
        name: t.name,
        bn_name: t.nameBn,
        isCity: true,
        type: 'metropolitan',
        cityCorpId: cityCorpId || undefined,
        badge: 'City',
      });
    } else {
      const idx = result.findIndex((r) => r.name.toLowerCase() === t.name.toLowerCase());
      if (idx !== -1) {
        result[idx].isCity = true;
        result[idx].badge = 'City';
        if (cityCorpId) result[idx].cityCorpId = cityCorpId;
      }
    }
  });

  return result;
}

// Legacy alias for backwards compatibility
export async function getUpazilas(districtId?: string): Promise<BdUpazilaThana[]> {
  return getUpazilasAndThanas(districtId);
}

export async function getUnionsOrWards(
  item?: { id: string; isCity?: boolean; cityCorpId?: string; district_id?: string }
): Promise<BdUnionWard[]> {
  if (!item || !item.id) return [];

  if (item.isCity) {
    let cityCorpId = item.cityCorpId;
    if (!cityCorpId && item.district_id) {
      const ccs = getCityCorporationsByDistrict(item.district_id);
      if (ccs && ccs.length > 0) cityCorpId = ccs[0].id;
    }
    if (!cityCorpId) {
      cityCorpId = 'cc-01';
    }
    const wards = getWardsByCityCorporation(cityCorpId) || [];
    return wards.map((w: any) => ({
      id: w.id,
      name: w.name,
      bn_name: w.nameBn,
      isWard: true,
      wardNo: w.wardNo,
      cityCorpId,
    }));
  }

  const unions = getUnionsByUpazila(item.id) || [];
  return unions.map((u: any) => ({
    id: u.id,
    upazila_id: u.upazilaId,
    name: u.name,
    bn_name: u.nameBn,
    postOffice: u.postOffice || '',
    postalCode: u.postalCode || '',
    isWard: false,
  }));
}

// Legacy alias for backwards compatibility
export async function getUnions(upazilaId?: string): Promise<BdUnionWard[]> {
  if (!upazilaId) return [];
  return getUnionsOrWards({ id: upazilaId, isCity: false });
}
