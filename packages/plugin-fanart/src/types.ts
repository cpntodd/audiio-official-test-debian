/**
 * Fanart.tv API response types
 */

export interface FanartImage {
  id: string;
  url: string;
  likes: string;
}

export interface FanartArtistResponse {
  name: string;
  mbid_id: string;
  artistbackground?: FanartImage[];
  artistthumb?: FanartImage[];
  hdmusiclogo?: FanartImage[];
  musiclogo?: FanartImage[];
  musicbanner?: FanartImage[];
  albums?: {
    [albumMbid: string]: {
      albumcover?: FanartImage[];
      cdart?: FanartImage[];
    };
  };
}

export interface FanartSettings {
  apiKey: string;
}
