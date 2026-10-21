export interface PolicyDoc {
  key: 'terms' | 'privacy';
  titleEn: string;
  titleBn: string;
  version: string;
  lastUpdated: string;
  legalDisclaimer: string;
  sectionsEn: { title: string; content: string }[];
  sectionsBn: { title: string; content: string }[];
}

export const DEFAULT_TERMS_POLICY: PolicyDoc = {
  key: 'terms',
  titleEn: 'ReSellBD Reseller Terms & Conditions',
  titleBn: 'রিসেলবিডি রিসেলার শর্তাবলী ও নিয়মাবলী',
  version: '1.0',
  lastUpdated: 'October 2026',
  legalDisclaimer: 'Notice: This policy draft was compiled for ReSellBD B2B operations in Bangladesh and must be reviewed by a certified legal attorney before commercial enforcement.',
  sectionsEn: [
    {
      title: '1. Account Eligibility & KYC Verification',
      content: 'Registration as an authorized reseller on ReSellBD requires submitting verified, authentic personal identification (National ID or Birth Certificate) and genuine shop ownership details. ReSellBD reserves the full right to approve, request additional information, or decline any registration application based on internal compliance standards.',
    },
    {
      title: '2. Accurate Information & Shop Legitimacy',
      content: 'You represent and warrant that all provided information, including owner full name, mobile number, shop address, and payout channels, are accurate and up-to-date. Misleading, impersonating, or providing fraudulent documentation will result in immediate permanent termination and reporting to relevant cyber authorities.',
    },
    {
      title: '3. Wholesale Orders & Commission Structure',
      content: 'Resellers purchase goods at verified wholesale supplier prices and set customer retail prices within allowed platform margins. Commissions represent the net profit between your customer retail price and the wholesale base price plus delivery and packaging expenses. ReSellBD guarantees transparent profit calculations visible inside your digital wallet.',
    },
    {
      title: '4. Profit Payout Rules & Schedules',
      content: 'Weekly profit disbursements are automatically released to your registered mobile wallet (bKash, Nagad, Rocket, Upay) or Bangladeshi commercial bank account upon successful customer delivery and return-period clearance. The minimum payout threshold is ৳200. ReSellBD does not deduct hidden transfer commissions for regular weekly cycles.',
    },
    {
      title: '5. Prohibited Activities & Anti-Fraud Policy',
      content: 'Resellers are strictly prohibited from engaging in fake order generation, self-order cash-out scams, manipulative returns, customer harassment, non-consensual telemarketing, or infringing intellectual property rights of branded products listed on the platform.',
    },
    {
      title: '6. Account Suspension & Termination',
      content: 'ReSellBD reserves the authority to temporarily suspend or permanently freeze reseller accounts exhibiting excessive customer return rates due to inaccurate product description, fraudulent transactions, or non-compliance with platform standards. Remaining undisputed wallet balances will be audited before final settlement.',
    },
    {
      title: '7. Customer Support & Dispute Resolution',
      content: 'For dispute resolution, order tracking inquiries, or policy clarifications, resellers can submit official tickets via Support or contact Sky Automation Tech support at skyautomationtech@gmail.com.',
    },
  ],
  sectionsBn: [
    {
      title: '১. অ্যাকাউন্ট যোগ্যতা ও কেওয়াইসি (KYC) যাচাইকরণ',
      content: 'রিসেলবিডি (ReSellBD) প্ল্যাটফর্মে অনুমোদিত রিসেলার হিসেবে নিবন্ধনের জন্য সঠিক ও বৈধ জাতীয় পরিচয়পত্র (NID) বা জন্মনিবন্ধন সনদ এবং দোকানের প্রকৃত তথ্য প্রদান বাধ্যতামূলক। অভ্যন্তরীণ যাচাই-বাছাইয়ের ভিত্তিতে যেকোনো আবেদন গ্রহণ, অতিরিক্ত তথ্য তলব কিংবা বাতিল করার পূর্ণ অধিকার রিসেলবিডি সংরক্ষণ করে।',
    },
    {
      title: '২. তথ্যের নির্ভুলতা ও শপের বৈধতা',
      content: 'আবেদনকারীকে নিশ্চিত করতে হবে যে প্রদত্ত নাম, মোবাইল নম্বর, শপের ঠিকানা ও পেমেন্ট সংক্রান্ত তথ্য সম্পূর্ণরূপে নির্ভুল ও নিজস্ব। ভুয়া তথ্য প্রদান, অন্যের পরিচয়ে অ্যাকাউন্ট তৈরি বা জাল ডকুমেন্ট প্রদান করলে তাৎক্ষণিকভাবে অ্যাকাউন্ট স্থায়ীভাবে বাতিল এবং প্রয়োজনীয় আইনি ব্যবস্থা গ্রহণ করা হবে।',
    },
    {
      title: '৩. পাইকারি অর্ডার ও কমিশন পলিসি',
      content: 'রিসেলারগণ নির্ধারিত পাইকারি মূল্যে পণ্য সংগ্রহ করে গ্রাহকদের নিকট নিজস্ব মূল্যে বিক্রয় করতে পারবেন। বিক্রয়মূল্য ও পাইকারি মূল্যের মধ্যবর্তী পার্থক্যই রিসেলারের কমিশন বা নিট মুনাফা হিসেবে গণ্য হবে, যা ডিজিটাল ওয়ালেটে স্বচ্ছভাবে প্রদর্শিত হবে।',
    },
    {
      title: '৪. প্রফিট পেআউট ও উত্তোলন নিয়মাবলী',
      content: 'গ্রাহকের নিকট সফল ডেলিভারি এবং রিটার্ন সময়সীমা অতিক্রান্ত হওয়ার পর অর্জিত কমিশন আপনার নিবন্ধিত বিকাশ, নগদ, রকেট, উপায় বা ব্যাংক অ্যাকাউন্টে স্বয়ংক্রিয়ভাবে পাঠানো হবে। সর্বনিম্ন পেআউট ব্যালেন্স ২০০ টাকা। নিয়মিত সাপ্তাহিক সাইকেলে কোনো অতিরিক্ত গোপন চার্জ কাটা হয় না।',
    },
    {
      title: '৫. নিষিদ্ধ কার্যক্রম ও জালিয়াতি প্রতিরোধ',
      content: 'ভুয়া অর্ডার প্রদান, সেলফ-অর্ডার ক্যাশ-আউট সুবিধা গ্রহণ, কৃত্রিম রিটার্ন তৈরি, গ্রাহকদের সাথে অসদাচরণ, কপিরাইট লঙ্ঘন বা প্রতারণামূলক প্রচার সম্পূর্ণ নিষিদ্ধ।',
    },
    {
      title: '৬. অ্যাকাউন্ট স্থগিতকরণ ও বাতিলকরণ',
      content: 'অস্বাভাবিক রিটার্ন হার, পণ্য সম্পর্কে বিভ্রান্তিকর তথ্য প্রদান কিংবা প্ল্যাটফর্মের নীতিমালা অমান্য করলে রিসেলবিডি যেকোনো অ্যাকাউন্ট সাময়িক বা স্থায়ীভাবে স্থগিত করতে পারবে। স্থগিত অ্যাকাউন্টের নিরপেক্ষ অডিট সম্পন্ন হওয়ার পর বৈধ ব্যালেন্স নিষ্পত্তি করা হবে।',
    },
    {
      title: '৭. কাস্টমার সাপোর্ট ও যোগাযোগ',
      content: 'যেকোনো সহায়তা বা অভিযোগের জন্য হেল্প ও সাপোর্ট সেকশন থেকে সরাসরি টিকেট ওপেন করুন অথবা skyautomationtech@gmail.com ঠিকানায় ইমেইল করুন।',
    },
  ],
};

export const DEFAULT_PRIVACY_POLICY: PolicyDoc = {
  key: 'privacy',
  titleEn: 'ReSellBD Reseller Privacy Policy',
  titleBn: 'রিসেলবিডি রিসেলার গোপনীয়তা নীতিমালা',
  version: '1.0',
  lastUpdated: 'October 2026',
  legalDisclaimer: 'Notice: This privacy policy draft was compiled for ReSellBD operations in Bangladesh and must be reviewed by a certified legal attorney before commercial enforcement.',
  sectionsEn: [
    {
      title: '1. Information We Collect',
      content: 'We collect personal identifying data including your full legal name, date of birth, contact email, mobile phone numbers, physical shop address, National ID (NID) photos, and banking/mobile wallet account credentials solely to facilitate authorized reseller commerce, identity verification, and profit disbursements.',
    },
    {
      title: '2. Purpose of Document & KYC Collection',
      content: 'Photos of your NID or Birth Certificate and shop logo are strictly utilized for identity verification, anti-money laundering compliance, and wholesale fraud prevention. This data is stored securely in encrypted cloud storage and accessible only to authorized compliance administrators.',
    },
    {
      title: '3. Device & Login Security Information',
      content: 'To prevent unauthorized account takeovers, our systems log device identifiers, operating system versions, IP addresses, and login timestamps. Suspicious logins from unverified devices trigger automated in-app security alerts.',
    },
    {
      title: '4. Non-Disclosure & Data Protection',
      content: 'ReSellBD never sells, rents, or commercializes reseller personal information to third-party marketing brokers. Data is shared exclusively with integrated logistics partners (for parcel pickups) and official banking/MFS gateways (for payout disbursements).',
    },
    {
      title: '5. Data Retention & Your Rights',
      content: 'Resellers can update contact credentials and review registered payout channels directly via Account Settings. Account closure requests can be submitted to our compliance desk for secure archival in accordance with Bangladesh financial record retention guidelines.',
    },
  ],
  sectionsBn: [
    {
      title: '১. সংগৃহীত তথ্যাবলী',
      content: 'আমরা আপনার নাম, জন্মতারিখ, ইমেইল, মোবাইল নম্বর, শপের ঠিকানা, জাতীয় পরিচয়পত্র (NID) বা জন্মনিবন্ধন সনদপত্র এবং ব্যাংক/মোবাইল ব্যাংকিং হিসাবের তথ্য সংগ্রহ করি শুধুমাত্র রিসেলার অনুমোদন, পরিচয় যাচাই এবং কমিশন প্রেরণের উদ্দেশ্যে।',
    },
    {
      title: '২. ডকুমেন্ট ও কেওয়াইসি (KYC) তথ্যের ব্যবহার',
      content: 'আপনার NID এবং শপ লোগো শুধুমাত্র পরিচয় শনাক্তকরণ ও আর্থিক নিরাপত্তা নিশ্চিত করতে ব্যবহৃত হয়। এই ডেটা সম্পূর্ণ সুরক্ষিত সার্ভারে সংরক্ষিত থাকে এবং শুধুমাত্র অনুমোদিত কমপ্লায়েন্স অ্যাডমিনদের নিকট সীমাবদ্ধ থাকে।',
    },
    {
      title: '৩. ডিভাইস ও লগইন নিরাপত্তা নজরদারি',
      content: 'অ্যাকাউন্টের সুরক্ষার্থে আমরা লগইন করা ডিভাইসের মডেল, ওএস সংস্করণ এবং লগইন সময় রেকর্ড করি। কোনো নতুন ডিভাইস থেকে লগইন শনাক্ত হলে সাথে সাথে সিকিউরিটি নোটিফিকেশন পাঠানো হয়।',
    },
    {
      title: '৪. তথ্য সুরক্ষা ও গোপনীয়তা',
      content: 'রিসেলবিডি কোনো অবস্থাতেই আপনার ব্যক্তিগত তথ্য কোনো তৃতীয় পক্ষের নিকট বিক্রি বা ভাড়া দেয় না। শুধুমাত্র ডেলিভারি পার্টনার এবং পেমেন্ট গেটওয়ের সাথে প্রয়োজনীয় তথ্য আদান-প্রদান করা হয়।',
    },
    {
      title: '৫. তথ্য সংরক্ষণ ও অধিকার',
      content: 'রিসেলারগণ যেকোনো সময় সেটিংস থেকে তাদের যোগাযোগের তথ্য পর্যালোচনা ও আপডেট করতে পারবেন। অ্যাকাউন্ট অপসারণের প্রয়োজন হলে সাপোর্ট টিমের সাথে যোগাযোগ করতে পারেন।',
    },
  ],
};
