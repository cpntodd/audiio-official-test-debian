/**
 * Bandsintown API response types
 */

export interface BandsintownEvent {
  id: string;
  artist_id: string;
  url: string;
  on_sale_datetime: string | null;
  datetime: string;
  description: string;
  venue: BandsintownVenue;
  lineup: string[];
  offers: BandsintownOffer[];
  starts_at: string;
  festival_start_date: string | null;
  festival_end_date: string | null;
  festival_datetime_display_rule: string | null;
  title: string | null;
  bandsintown_plus: boolean;
}

export interface BandsintownVenue {
  name: string;
  location: string;
  city: string;
  region: string;
  country: string;
  latitude: string;
  longitude: string;
}

export interface BandsintownOffer {
  type: string;
  url: string;
  status: string;
}

export interface BandsintownArtist {
  id: string;
  name: string;
  url: string;
  image_url: string;
  thumb_url: string;
  facebook_page_url: string | null;
  mbid: string | null;
  tracker_count: number;
  upcoming_event_count: number;
}

export interface BandsintownSettings {
  appId: string;
}
