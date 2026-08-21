// The interface every caller of TikTok data must depend on — never call a concrete provider
// (Display API today, a vendor scraper in M7) directly from business logic. CLAUDE.md: "Mọi truy
// cập TikTok data phải đi qua interface TikTokDataProvider... để đổi nguồn/fallback vendor không
// phải sửa core."
//
// OAuth (authorize URL, token exchange/refresh) is deliberately NOT part of this interface — it's
// specific to Display API's per-channel consent flow. A vendor scraper wouldn't have it at all.
// See lib/tiktok/oauth.ts.

export type TikTokUserStats = {
  followerCount: number;
  videoCount: number;
};

export type TikTokVideo = {
  id: string;
  createTime: number; // Unix seconds, UTC
  title: string | null;
  videoLink: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
};

export type ListVideosResult = {
  videos: TikTokVideo[];
  /** false when the API returned fewer videos than it should have — rate-limited, or pagination
   *  hit the safety cap. Never use a result with isComplete=false to compute KPI numbers. */
  isComplete: boolean;
  rateLimited: boolean;
  hitSafetyCap: boolean;
};

export interface TikTokDataProvider {
  getUserInfo(accessToken: string): Promise<TikTokUserStats>;
  listAllVideos(accessToken: string): Promise<ListVideosResult>;
}
