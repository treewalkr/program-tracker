import { describe, expect, test } from "bun:test";
import { inAppBrowser, inAppHint, inAppName, phoneBrowser, withExternalBrowser, withoutExternalBrowser } from "./inAppBrowser";

/** Real user agents, as each app sends them (iOS 17 / Android 14). */
const UA = {
  lineIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.19.0",
  lineAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36 Line/14.19.1/IAB",
  messengerIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/466.0.0.36.109;FBBV/617218553;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/5;FBRV/0]",
  messengerAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/466.0.0.48.109;]",
  facebookIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.37.97;FBBV/620317185;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.43.109;]",
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 355.0.0.20.108 (iPhone14,5; iOS 17_5; en_US; en; scale=3.00; 1170x2532; 653458208)",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36 Instagram 355.0.0.37.108 Android (34/14; 420dpi; 1080x2400; Google/google; Pixel 7; panther; panther; en_US; 653458209)",
  androidWebview:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36",
  safariIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1",
  googleAppIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/340.0.689466045 Mobile/15E148 Safari/604.1",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  desktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

describe("inAppBrowser", () => {
  test("names LINE, Messenger, Facebook and Instagram on iOS and Android", () => {
    expect(inAppBrowser(UA.lineIos)).toBe("line");
    expect(inAppBrowser(UA.lineAndroid)).toBe("line");
    expect(inAppBrowser(UA.messengerIos)).toBe("messenger");
    expect(inAppBrowser(UA.messengerAndroid)).toBe("messenger");
    expect(inAppBrowser(UA.facebookIos)).toBe("facebook");
    expect(inAppBrowser(UA.facebookAndroid)).toBe("facebook");
    expect(inAppBrowser(UA.instagramIos)).toBe("instagram");
    expect(inAppBrowser(UA.instagramAndroid)).toBe("instagram");
  });

  test("an unnamed Android WebView is still an in-app browser", () => {
    expect(inAppBrowser(UA.androidWebview)).toBe("webview");
    expect(inAppName("webview")).toBeNull();
  });

  test("real browsers pass: Safari, Chrome (iOS, Android, desktop), the Google app", () => {
    for (const ua of [UA.safariIos, UA.chromeIos, UA.chromeAndroid, UA.desktop, UA.googleAppIos, ""]) {
      expect(inAppBrowser(ua)).toBeNull();
    }
  });

  test("names the phone's own browser", () => {
    expect(phoneBrowser(UA.lineIos)).toBe("Safari");
    expect(phoneBrowser(UA.lineAndroid)).toBe("Chrome");
    expect(inAppName("line")).toBe("LINE");
  });

  test("hint: app, browser and menu glyph per platform", () => {
    expect(inAppHint(UA.instagramIos)).toEqual({ app: "instagram", name: "Instagram", browser: "Safari", menu: "⋯" });
    expect(inAppHint(UA.messengerAndroid)).toEqual({ app: "messenger", name: "Messenger", browser: "Chrome", menu: "⋮" });
    expect(inAppHint(UA.safariIos)).toBeNull();
  });
});

describe("openExternalBrowser", () => {
  test("adds the flag once, keeping query and hash", () => {
    expect(withExternalBrowser("https://pt.pinroj.com/me/link/abc")).toBe("https://pt.pinroj.com/me/link/abc?openExternalBrowser=1");
    expect(withExternalBrowser("/me/login?returnTo=%2Fme#x")).toBe("/me/login?returnTo=%2Fme&openExternalBrowser=1#x");
    const once = withExternalBrowser("/me/link/abc");
    expect(withExternalBrowser(once)).toBe(once);
  });

  test("drops it from the address, keeping everything else", () => {
    const clean = withoutExternalBrowser(new URL("https://x.test/en/me/link/abc?openExternalBrowser=1&fbclid=z"));
    expect(clean?.href).toBe("https://x.test/en/me/link/abc?fbclid=z");
    expect(withoutExternalBrowser(new URL("https://x.test/en/me/link/abc"))).toBeNull();
  });
});
