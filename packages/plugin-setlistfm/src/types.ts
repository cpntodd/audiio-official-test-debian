/**
 * Setlist.fm API response types
 */

export interface SetlistFmSearchResponse {
  type: string;
  itemsPerPage: number;
  page: number;
  total: number;
  artist?: SetlistFmArtist[];
  setlist?: SetlistFmSetlist[];
}

export interface SetlistFmArtist {
  mbid: string;
  name: string;
  sortName: string;
  disambiguation?: string;
  url: string;
}

export interface SetlistFmSetlist {
  id: string;
  versionId: string;
  eventDate: string;
  lastUpdated: string;
  artist: SetlistFmArtist;
  venue: SetlistFmVenue;
  tour?: {
    name: string;
  };
  sets: {
    set: SetlistFmSet[];
  };
  url: string;
}

export interface SetlistFmVenue {
  id: string;
  name: string;
  city: SetlistFmCity;
  url: string;
}

export interface SetlistFmCity {
  id: string;
  name: string;
  state?: string;
  stateCode?: string;
  coords: {
    lat: number;
    long: number;
  };
  country: {
    code: string;
    name: string;
  };
}

export interface SetlistFmSet {
  name?: string;
  encore?: number;
  song: SetlistFmSong[];
}

export interface SetlistFmSong {
  name: string;
  info?: string;
  cover?: {
    mbid: string;
    name: string;
    sortName: string;
    url: string;
  };
  with?: {
    mbid: string;
    name: string;
    sortName: string;
    url: string;
  };
  tape?: boolean;
}

export interface SetlistFmSettings {
  apiKey: string;
}
