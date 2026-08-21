import { describe, expect, it } from "vitest";

import { parseContentCsv } from "./content";

const HEADER = '"Time","Video title","Video link","Post time","Total likes","Total comments","Total shares","Total views"';

describe("parseContentCsv", () => {
  it("extracts the tiktok video id from the video link", () => {
    const csv = `${HEADER}\n"18 tháng Tám","Trồng nho #nongnghiep #trainghiem","https://www.tiktok.com/@kenh/video/7672373276106181908","10 tháng Tám","10","1","2","100"`;
    const rows = parseContentCsv(csv, "2026-08-20");
    expect(rows).toHaveLength(1);
    expect(rows[0].tiktokVideoId).toBe("7672373276106181908");
    expect(rows[0].videoLink).toBe("https://www.tiktok.com/@kenh/video/7672373276106181908");
  });

  it("extracts hashtags from the title", () => {
    const csv = `${HEADER}\n"18 tháng Tám","Trồng nho #nongnghiep #trainghiem viral","https://www.tiktok.com/@kenh/video/1","10 tháng Tám","0","0","0","0"`;
    const rows = parseContentCsv(csv, "2026-08-20");
    expect(rows[0].hashtags).toEqual(["nongnghiep", "trainghiem"]);
  });

  it("resolves postedAt from Post time as VN midnight", () => {
    const csv = `${HEADER}\n"18 tháng Tám","x","https://www.tiktok.com/@kenh/video/1","10 tháng Tám","0","0","0","0"`;
    const rows = parseContentCsv(csv, "2026-08-20");
    expect(rows[0].postedAt).toBe("2026-08-10T00:00:00+07:00");
  });

  it("skips a row with no recognizable video link", () => {
    const csv = `${HEADER}\n"18 tháng Tám","x","not-a-video-url","10 tháng Tám","0","0","0","0"`;
    expect(parseContentCsv(csv, "2026-08-20")).toEqual([]);
  });

  it("returns an empty hashtag list when the title has none", () => {
    const csv = `${HEADER}\n"18 tháng Tám","Plain title","https://www.tiktok.com/@kenh/video/1","10 tháng Tám","0","0","0","0"`;
    expect(parseContentCsv(csv, "2026-08-20")[0].hashtags).toEqual([]);
  });
});
