/**
 * Complete list of scheduled and operating commercial banks in Bangladesh
 * Source: Bangladesh Bank (Central Bank of Bangladesh)
 */

export interface BdBank {
  id: string;
  name: string;
  category: 'state_owned' | 'private_commercial' | 'foreign' | 'other';
}

export const BANGLADESH_BANKS: BdBank[] = [
  // --- State-Owned & Specialized Banks ---
  { id: 'sonali', name: 'Sonali Bank PLC', category: 'state_owned' },
  { id: 'janata', name: 'Janata Bank PLC', category: 'state_owned' },
  { id: 'agrani', name: 'Agrani Bank PLC', category: 'state_owned' },
  { id: 'rupali', name: 'Rupali Bank PLC', category: 'state_owned' },
  { id: 'basic', name: 'BASIC Bank Limited', category: 'state_owned' },
  { id: 'bdb', name: 'Bangladesh Development Bank Limited (BDBL)', category: 'state_owned' },
  { id: 'bkb', name: 'Bangladesh Krishi Bank', category: 'state_owned' },
  { id: 'rakub', name: 'Rajshahi Krishi Unnayan Bank (RAKUB)', category: 'state_owned' },
  { id: 'probashi', name: 'Probashi Kallyan Bank', category: 'state_owned' },
  { id: 'ansar_vdp', name: 'Ansar-VDP Unnayan Bank', category: 'state_owned' },
  { id: 'karmasangsthan', name: 'Karmasangsthan Bank', category: 'state_owned' },
  { id: 'grameen', name: 'Grameen Bank', category: 'state_owned' },

  // --- Private Commercial Banks ---
  { id: 'ab_bank', name: 'AB Bank Limited', category: 'private_commercial' },
  { id: 'al_arafah', name: 'Al-Arafah Islami Bank PLC', category: 'private_commercial' },
  { id: 'bank_asia', name: 'Bank Asia PLC', category: 'private_commercial' },
  { id: 'bengal_comm', name: 'Bengal Commercial Bank Limited', category: 'private_commercial' },
  { id: 'brac_bank', name: 'BRAC Bank PLC', category: 'private_commercial' },
  { id: 'city_bank', name: 'City Bank PLC', category: 'private_commercial' },
  { id: 'citizens_bank', name: 'Citizens Bank PLC', category: 'private_commercial' },
  { id: 'community_bank', name: 'Community Bank Bangladesh PLC', category: 'private_commercial' },
  { id: 'dhaka_bank', name: 'Dhaka Bank PLC', category: 'private_commercial' },
  { id: 'dbbl', name: 'Dutch-Bangla Bank PLC (DBBL)', category: 'private_commercial' },
  { id: 'ebl', name: 'Eastern Bank PLC (EBL)', category: 'private_commercial' },
  { id: 'exim_bank', name: 'EXIM Bank PLC', category: 'private_commercial' },
  { id: 'fsibl', name: 'First Security Islami Bank PLC', category: 'private_commercial' },
  { id: 'global_islami', name: 'Global Islami Bank PLC', category: 'private_commercial' },
  { id: 'icb_islamic', name: 'ICB Islamic Bank Limited', category: 'private_commercial' },
  { id: 'ific_bank', name: 'IFIC Bank PLC', category: 'private_commercial' },
  { id: 'islami_bank', name: 'Islami Bank Bangladesh PLC (IBBL)', category: 'private_commercial' },
  { id: 'jamuna_bank', name: 'Jamuna Bank PLC', category: 'private_commercial' },
  { id: 'meghna_bank', name: 'Meghna Bank PLC', category: 'private_commercial' },
  { id: 'mercantile_bank', name: 'Mercantile Bank PLC', category: 'private_commercial' },
  { id: 'midland_bank', name: 'Midland Bank Limited', category: 'private_commercial' },
  { id: 'modhumoti_bank', name: 'Modhumoti Bank PLC', category: 'private_commercial' },
  { id: 'mtbl', name: 'Mutual Trust Bank PLC (MTB)', category: 'private_commercial' },
  { id: 'national_bank', name: 'National Bank Limited', category: 'private_commercial' },
  { id: 'ncc_bank', name: 'NCC Bank PLC', category: 'private_commercial' },
  { id: 'nrb_bank', name: 'NRB Bank Limited', category: 'private_commercial' },
  { id: 'nrb_comm_bank', name: 'NRBC Bank PLC', category: 'private_commercial' },
  { id: 'one_bank', name: 'ONE Bank PLC', category: 'private_commercial' },
  { id: 'padma_bank', name: 'Padma Bank Limited', category: 'private_commercial' },
  { id: 'premier_bank', name: 'Premier Bank PLC', category: 'private_commercial' },
  { id: 'prime_bank', name: 'Prime Bank PLC', category: 'private_commercial' },
  { id: 'pubali_bank', name: 'Pubali Bank PLC', category: 'private_commercial' },
  { id: 'sbac_bank', name: 'South Bangla Agriculture & Commerce Bank PLC', category: 'private_commercial' },
  { id: 'shahjalal_islami', name: 'Shahjalal Islami Bank PLC', category: 'private_commercial' },
  { id: 'sibl', name: 'Social Islami Bank PLC', category: 'private_commercial' },
  { id: 'southeast_bank', name: 'Southeast Bank PLC', category: 'private_commercial' },
  { id: 'standard_bank', name: 'Standard Bank PLC', category: 'private_commercial' },
  { id: 'trust_bank', name: 'Trust Bank Limited', category: 'private_commercial' },
  { id: 'union_bank', name: 'Union Bank PLC', category: 'private_commercial' },
  { id: 'ucb', name: 'United Commercial Bank PLC (UCB)', category: 'private_commercial' },
  { id: 'uttara_bank', name: 'Uttara Bank PLC', category: 'private_commercial' },
  { id: 'commercial_ceylon', name: 'Commercial Bank of Ceylon PLC', category: 'private_commercial' },

  // --- Foreign Commercial Banks ---
  { id: 'scb', name: 'Standard Chartered Bank', category: 'foreign' },
  { id: 'hsbc', name: 'HSBC Bangladesh', category: 'foreign' },
  { id: 'citibank', name: 'Citibank N.A. Bangladesh', category: 'foreign' },
  { id: 'habib_bank', name: 'Habib Bank Limited', category: 'foreign' },
  { id: 'sbi', name: 'State Bank of India Bangladesh', category: 'foreign' },
  { id: 'woori_bank', name: 'Woori Bank Bangladesh', category: 'foreign' },
  { id: 'bank_alfalah', name: 'Bank Alfalah Limited Bangladesh', category: 'foreign' },
  { id: 'nbp', name: 'National Bank of Pakistan Bangladesh', category: 'foreign' },

  // --- Other ---
  { id: 'other_bank', name: 'Other Bank / Financial Institution', category: 'other' },
];
