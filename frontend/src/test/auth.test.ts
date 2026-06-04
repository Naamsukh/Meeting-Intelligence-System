import { describe, expect, it, beforeEach } from "vitest";
import { clearToken, formatTimestamp, getToken, isAuthenticated, setToken } from "@/lib/auth";

describe("auth token storage", () => {
  beforeEach(() => clearToken());

  it("stores and reads a token", () => {
    expect(isAuthenticated()).toBe(false);
    setToken("abc.def.ghi");
    expect(getToken()).toBe("abc.def.ghi");
    expect(isAuthenticated()).toBe(true);
  });

  it("clears the token", () => {
    setToken("xyz");
    clearToken();
    expect(getToken()).toBeNull();
  });
});

describe("formatTimestamp", () => {
  it("formats mm:ss under an hour", () => {
    expect(formatTimestamp(75)).toBe("01:15");
  });
  it("formats hh:mm:ss over an hour", () => {
    expect(formatTimestamp(3725)).toBe("01:02:05");
  });
});
