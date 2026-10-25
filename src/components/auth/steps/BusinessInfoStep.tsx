import React from 'react';
import { ExternalLink } from 'lucide-react';

export const BusinessInfoStep = ({ data, update }: any) => {
  const fields = [
    { key: 'facebookPage', label: 'Facebook Page Link (Required)', placeholder: 'https://facebook.com/...' },
    { key: 'tiktokUrl', label: 'TikTok Profile Link', placeholder: 'https://tiktok.com/...' },
    { key: 'instagramUrl', label: 'Instagram Profile Link', placeholder: 'https://instagram.com/...' },
    { key: 'youtubeUrl', label: 'YouTube Channel', placeholder: 'https://youtube.com/...' }
  ];

  return (
    <div className="space-y-4">
      {fields.map(f => (
        <div key={f.key} className="relative">
          <input 
            type="url" 
            placeholder={f.placeholder} 
            value={data[f.key] || ''} 
            onChange={e => update({ [f.key]: e.target.value })} 
            className="w-full p-4 pl-4 pr-12 rounded-full bg-white/10 text-white" 
          />
          {data[f.key] && (
            <a href={data[f.key]} target="_blank" rel="noopener noreferrer" className="absolute right-4 top-4 text-cyan-400">
              <ExternalLink className="w-5 h-5" />
            </a>
          )}
        </div>
      ))}
    </div>
  );
};
