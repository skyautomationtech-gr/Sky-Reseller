import React from 'react';

export const BasicDetailsStep = ({ data, update }: any) => (
  <div className="space-y-4">
    <input type="text" placeholder="Full Name" value={data.fullName} onChange={e => update({ fullName: e.target.value })} className="w-full p-4 rounded-full bg-white/10 text-white" />
    <input type="text" placeholder="Shop Name" value={data.shopName} onChange={e => update({ shopName: e.target.value })} className="w-full p-4 rounded-full bg-white/10 text-white" />
    <input type="date" value={data.dob} onChange={e => update({ dob: e.target.value })} className="w-full p-4 rounded-full bg-white/10 text-white" />
    <select value={data.gender} onChange={e => update({ gender: e.target.value })} className="w-full p-4 rounded-full bg-white/10 text-white">
      <option value="">Select Gender</option>
      <option value="male">Male</option>
      <option value="female">Female</option>
      <option value="transgender">Transgender</option>
    </select>
  </div>
);
