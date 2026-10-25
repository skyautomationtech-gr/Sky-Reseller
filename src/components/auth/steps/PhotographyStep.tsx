import React, { useState } from 'react';
import { Upload, X } from 'lucide-react';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { app } from '../../../lib/firebase';

export const PhotographyStep = ({ data, update }: any) => {
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileUpload = (file: File, key: string) => {
    const storage = getStorage(app);
    const storageRef = ref(storage, `users/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed', (snapshot) => {
      setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
    }, (error) => console.error(error), () => {
      getDownloadURL(uploadTask.snapshot.ref).then(url => update({ [key]: url }));
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-white mb-2">Shop Logo (Square 1:1, Required)</label>
        <input type="file" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'shopLogoUrl')} className="w-full p-4 bg-white/5 text-white" />
        {data.shopLogoUrl && <img src={data.shopLogoUrl} className="w-20 h-20 rounded-full mt-2" />}
      </div>
      <div>
        <label className="block text-white mb-2">Document Type</label>
        <select value={data.documentType} onChange={e => update({ documentType: e.target.value })} className="w-full p-4 rounded-full bg-white/10 text-white">
          <option value="nid">National ID (NID)</option>
          <option value="birth_certificate">Birth Certificate</option>
        </select>
      </div>
      {data.documentType === 'nid' ? (
        <div className="grid grid-cols-2 gap-4">
          <input type="file" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'nidFrontUrl')} className="p-4 bg-white/5 text-white" />
          <input type="file" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'nidBackUrl')} className="p-4 bg-white/5 text-white" />
        </div>
      ) : (
        <input type="file" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'birthCertificateUrl')} className="w-full p-4 bg-white/5 text-white" />
      )}
    </div>
  );
};
