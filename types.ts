export enum Destination {
  OSAKA_KYOTO = '오사카 & 교토',
  TOKYO = '도쿄',
  FUKUOKA = '후쿠오카',
  HANOI = '하노이',
  DA_NANG = '다낭',
  HO_CHI_MINH = '호치민',
  PHU_QUOC = '푸꾸옥',
  NHATRANG = '나트랑',
  SEOUL = '서울',
  BUSAN = '부산',
  JEJU = '제주',
}

export enum Country {
  JAPAN = '일본',
  VIETNAM = '베트남',
  KOREA = '한국',
}

export interface ScheduleItem {
  time: string;
  activity: string;
  description: string;
  transportation: string; // 상세 교통정보
}

export interface DailyPlan {
  day: string;
  date: string;
  theme: string;
  schedule: ScheduleItem[];
}

export interface Recommendation {
    name: string;
    area: string;
    notes: string;
    rating: number;
}

export interface HotelRecommendation extends Recommendation {
    priceRange: string;
}

export interface TransportationGuideItem {
  method: string;
  tips: string;
  duration: string;
  cost: string;
  recommended: boolean;
}

export interface TravelPlan {
  tripTitle: string;
  tripOverview: string;
  estimatedCost: string;
  dailyItinerary: DailyPlan[];
  hotelRecommendations: HotelRecommendation[];
  transportationGuide: TransportationGuideItem[] | string | null;
  restaurantRecommendations: Recommendation[];
}

export interface SavedPlan {
  id: number;
  plan: TravelPlan;
  country: Country;
  destination: Destination;
  startDate: string;
  endDate: string;
  mustVisitPlaces: string[]; // 여행 조건 추가
}
