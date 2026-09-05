import { describe, expect, it } from "vitest";

import {
  detectChannelMismatch,
  handleFromFilenames,
  handleFromVideoLink,
  mismatchMessage,
  normalizeHandle,
} from "./channel-guard";

const KNOWN = [
  { name: "Bé Na", tiktokHandle: "@c.ba.nng.sn2" },
  { name: "Làm Nông Thông Thái", tiktokHandle: "@lam.nong.thong.thai" },
  { name: "Vườn Của Hant", tiktokHandle: "@vn.ca.hant" },
];

// Đúng bộ file đã gây ra sự cố 05/09/2026 (zip của Làm Nông Thông Thái, dropdown đang ở Bé Na).
const REAL_FILENAMES = [
  "Content_lam.nong.thong.thai.zip",
  "Followers_lam.nong.thong.thai.zip",
  "Overview_2026-07-06_1788400185_lam.nong.thong.thai.zip",
  "Viewers_lam.nong.thong.thai.zip",
];

describe("normalizeHandle", () => {
  it("bỏ @ và hạ chữ thường", () => {
    expect(normalizeHandle("@Lam.Nong.Thong.Thai")).toBe("lam.nong.thong.thai");
    expect(normalizeHandle("  c.ba.nng.sn2 ")).toBe("c.ba.nng.sn2");
  });
});

describe("handleFromVideoLink", () => {
  it("đọc handle từ link video thật", () => {
    expect(handleFromVideoLink("https://www.tiktok.com/@lam.nong.thong.thai/video/7412345678901234567")).toBe(
      "lam.nong.thong.thai",
    );
  });

  it("null khi link không đúng dạng", () => {
    expect(handleFromVideoLink("https://www.tiktok.com/video/74123")).toBeNull();
    expect(handleFromVideoLink("")).toBeNull();
  });
});

describe("handleFromFilenames", () => {
  it("nhận ra handle nhúng trong tên file Studio", () => {
    expect(handleFromFilenames(REAL_FILENAMES, ["lam.nong.thong.thai", "c.ba.nng.sn2"])).toBe("lam.nong.thong.thai");
  });

  it("null khi file đã bị đổi tên — không đoán mò", () => {
    expect(handleFromFilenames(["Overview.zip", "Followers.zip"], ["lam.nong.thong.thai"])).toBeNull();
  });

  it("ưu tiên handle DÀI NHẤT để không nuốt nhầm handle lồng nhau", () => {
    expect(handleFromFilenames(["Overview_vn.ca.hant.2.zip"], ["vn.ca.hant", "vn.ca.hant.2"])).toBe("vn.ca.hant.2");
  });
});

describe("detectChannelMismatch", () => {
  it("bắt đúng sự cố thật: zip Làm Nông Thông Thái + dropdown Bé Na", () => {
    const mismatch = detectChannelMismatch({
      selectedHandle: "@c.ba.nng.sn2",
      filenames: REAL_FILENAMES,
      videoLinks: ["https://www.tiktok.com/@lam.nong.thong.thai/video/7412345678901234567"],
      knownChannels: KNOWN,
    });
    expect(mismatch).toEqual({
      foundHandle: "lam.nong.thong.thai",
      foundChannelName: "Làm Nông Thông Thái",
      evidence: "video_link",
    });
  });

  it("vẫn bắt được khi không có Content.csv — chỉ dựa vào tên file", () => {
    const mismatch = detectChannelMismatch({
      selectedHandle: "@c.ba.nng.sn2",
      filenames: REAL_FILENAMES,
      videoLinks: [],
      knownChannels: KNOWN,
    });
    expect(mismatch?.foundHandle).toBe("lam.nong.thong.thai");
    expect(mismatch?.evidence).toBe("filename");
  });

  it("cho qua khi đúng kênh", () => {
    expect(
      detectChannelMismatch({
        selectedHandle: "@lam.nong.thong.thai",
        filenames: REAL_FILENAMES,
        videoLinks: ["https://www.tiktok.com/@lam.nong.thong.thai/video/7412345678901234567"],
        knownChannels: KNOWN,
      }),
    ).toBeNull();
  });

  it("cho qua khi file bị đổi tên và không có Content.csv — không chứng minh được thì không chặn", () => {
    expect(
      detectChannelMismatch({
        selectedHandle: "@c.ba.nng.sn2",
        filenames: ["Overview.zip", "Followers.zip", "Viewers.zip"],
        videoLinks: [],
        knownChannels: KNOWN,
      }),
    ).toBeNull();
  });

  it("link video thắng tên file: file rename đúng tên kênh vẫn bị bắt nếu nội dung là kênh khác", () => {
    const mismatch = detectChannelMismatch({
      selectedHandle: "@c.ba.nng.sn2",
      filenames: ["Overview_c.ba.nng.sn2.zip"],
      videoLinks: ["https://www.tiktok.com/@lam.nong.thong.thai/video/7412345678901234567"],
      knownChannels: KNOWN,
    });
    expect(mismatch?.evidence).toBe("video_link");
  });

  it("chặn cả khi handle lạ, chưa có trong hệ thống", () => {
    const mismatch = detectChannelMismatch({
      selectedHandle: "@c.ba.nng.sn2",
      filenames: [],
      videoLinks: ["https://www.tiktok.com/@kenh.la.hoac.moi/video/7412345678901234567"],
      knownChannels: KNOWN,
    });
    expect(mismatch).toEqual({
      foundHandle: "kenh.la.hoac.moi",
      foundChannelName: null,
      evidence: "video_link",
    });
  });
});

describe("mismatchMessage", () => {
  it("nói rõ file của kênh nào, đang chọn kênh nào", () => {
    const msg = mismatchMessage(
      { foundHandle: "lam.nong.thong.thai", foundChannelName: "Làm Nông Thông Thái", evidence: "video_link" },
      "Bé Na",
      "@c.ba.nng.sn2",
    );
    expect(msg).toContain("Làm Nông Thông Thái");
    expect(msg).toContain("Bé Na");
    expect(msg).toContain("link video trong Content.csv");
  });
});
