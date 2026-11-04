import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addMember, createInvite, getMember, getWallet, listPurchases, peekInvite, redeemInvite, removeMember } from "@/lib/db";
import { allowedPushEndpoint } from "@/lib/notify";

afterEach(() => vi.useRealTimers());

function invite(walletId = getWallet(randomUUID()).id, days = 7) {
  const token = randomUUID().replaceAll("-", "");
  createInvite({ token, walletId, name: "Mum", expiresAt: new Date(Date.now() + days * 86_400_000) });
  return { token, walletId };
}

describe("invites", () => {
  it("can be used once", () => {
    const { token, walletId } = invite();
    expect(redeemInvite(token)?.walletId).toBe(walletId);
    expect(redeemInvite(token)).toBeNull();
  });

  it("can be looked at without being used up", () => {
    const { token } = invite();
    expect(peekInvite(token)?.name).toBe("Mum");
    expect(peekInvite(token)?.name).toBe("Mum");
    expect(redeemInvite(token)).not.toBeNull();
  });

  it("stop working after they expire", () => {
    const { token } = invite();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 8 * 86_400_000);
    expect(peekInvite(token)).toBeNull();
    expect(redeemInvite(token)).toBeNull();
  });

  it("don't work with a made-up token", () => {
    expect(redeemInvite("not-a-real-token-at-all")).toBeNull();
  });
});

describe("members", () => {
  it("belong to one wallet and can be removed only from it", () => {
    const wallet = getWallet(randomUUID());
    const other = getWallet(randomUUID());
    const id = randomUUID();
    addMember({ id, walletId: wallet.id, name: "Mum" });
    expect(getMember(id)?.walletId).toBe(wallet.id);
    expect(removeMember(other.id, id)).toBe(false);
    expect(removeMember(wallet.id, id)).toBe(true);
    expect(getMember(id)).toBeNull();
    expect(listPurchases(wallet.id, id)).toEqual([]);
  });
});

describe("allowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
    "https://web.push.apple.com/abc",
  ])("accepts the real push service %s", (url) => {
    expect(allowedPushEndpoint(url)).toBe(true);
  });

  it.each([
    "https://169.254.169.254/latest/meta-data",
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com.evil.example/x",
    "https://evilfcm.googleapis.com.example/x",
    "https://user:pass@fcm.googleapis.com/x",
    "https://localhost/x",
    "not a url",
  ])("refuses %s", (url) => {
    expect(allowedPushEndpoint(url)).toBe(false);
  });
});
