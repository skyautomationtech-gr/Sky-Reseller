import React, { useState, useEffect } from 'react';
import { getDivisions, getDistricts, getUpazilas, getUnions } from '../../../data/bd/geocodeService';

export const ShopAddressStep = ({ data, update }: any) => {
  const [divisions, setDivisions] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [upazilas, setUpazilas] = useState<any[]>([]);
  const [unions, setUnions] = useState<any[]>([]);

  useEffect(() => { getDivisions().then(setDivisions); }, []);
  
  useEffect(() => { if (data.divisionId) getDistricts(data.divisionId).then(setDistricts); }, [data.divisionId]);
  useEffect(() => { if (data.districtId) getUpazilas(data.districtId).then(setUpazilas); }, [data.districtId]);
  useEffect(() => { if (data.upazilaId) getUnions(data.upazilaId).then(setUnions); }, [data.upazilaId]);

  return (
    <div className="space-y-4">
      <select value={data.divisionId} onChange={e => update({ divisionId: e.target.value })} className="w-full p-4 rounded-full bg-white/10 text-white">
        <option value="">Select Division</option>
        {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <select value={data.districtId} onChange={e => update({ districtId: e.target.value })} className="w-full p-4 rounded-full bg-white/10 text-white">
        <option value="">Select District</option>
        {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <select value={data.upazilaId} onChange={e => update({ upazilaId: e.target.value })} className="w-full p-4 rounded-full bg-white/10 text-white">
        <option value="">Select Upazila</option>
        {upazilas.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <select value={data.unionId} onChange={e => update({ unionId: e.target.value })} className="w-full p-4 rounded-full bg-white/10 text-white">
        <option value="">Select Union</option>
        {unions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <input type="text" placeholder="Postal Code" value={data.postalCode} onChange={e => update({ postalCode: e.target.value })} className="w-full p-4 rounded-full bg-white/10 text-white" />
      <textarea placeholder="Full Address" value={data.address} onChange={e => update({ address: e.target.value })} className="w-full p-4 rounded-3xl bg-white/10 text-white" />
    </div>
  );
};
