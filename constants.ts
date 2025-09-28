import { Destination, Country } from './types';

export const COUNTRY_DESTINATIONS: Record<Country, Destination[]> = {
  [Country.JAPAN]: [
    Destination.OSAKA_KYOTO,
    Destination.TOKYO,
    Destination.FUKUOKA,
  ],
  [Country.VIETNAM]: [
    Destination.HANOI,
    Destination.DA_NANG,
    Destination.HO_CHI_MINH,
    Destination.PHU_QUOC,
  ],
};

export const COUNTRIES: Country[] = [Country.JAPAN, Country.VIETNAM];

export const DESTINATIONS: Destination[] = [
  ...COUNTRY_DESTINATIONS[Country.JAPAN],
  ...COUNTRY_DESTINATIONS[Country.VIETNAM],
];

export const DESTINATION_AIRPORTS: { [key in Destination]: string } = {
  [Destination.OSAKA_KYOTO]: 'KIX', // 간사이 국제공항
  [Destination.TOKYO]: 'NRT',       // 나리타 국제공항
  [Destination.FUKUOKA]: 'FUK',     // 후쿠오카 공항
  [Destination.HANOI]: 'HAN',       // 노이바이 국제공항
  [Destination.DA_NANG]: 'DAD',     // 다낭 국제공항
  [Destination.HO_CHI_MINH]: 'SGN', // 탄손낫 국제공항
  [Destination.PHU_QUOC]: 'PQC',     // 푸꾸옥 국제공항
};
