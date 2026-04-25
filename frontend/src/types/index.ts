export interface PublicUser {
  id: number;
  auth_id: string;
  email: string;
  name: string | null;
  is_active: boolean;
}

export interface ExtraFilters {
  floor: string;
  origin: string;
  perPage: string;
  isVerified: string;
  isPersonalPost: string;
  parkingSpaces?: string;
  includesWater?: string;
  includesHydro?: string;
  independentKitchen?: string;
  independentBathroom?: string;
  [key: string]: string | undefined;
}

export interface Subscription {
  id: number;
  user_id: number;
  name: string;
  is_active: boolean;
  email_frequency_hours: number;
  price_min: number;
  price_max: number;
  bounding_box: string;
  building_types: string;
  rental_types: string;
  extra_filters: ExtraFilters;
  last_polled_at: string | null;
  last_emailed_at: string | null;
  next_email_at: string;
  created_at: string;
  updated_at: string;
}

export type SubscriptionInsert = Omit<
  Subscription,
  'id' | 'last_polled_at' | 'last_emailed_at' | 'next_email_at' | 'created_at' | 'updated_at'
>;
