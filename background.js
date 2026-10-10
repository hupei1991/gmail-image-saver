"use strict";

importScripts("i18n.js");
const t = GmailImageI18n.t;
const MENU_ID = "gmail-save-original-image";
const DEFAULT_TITLE = t("extName");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      // Gmail's resize overlay can turn an image click into a page/editable context.
      id: MENU_ID, title: t("menuSave"), contexts: ["all"],
      documentUrlPatterns: ["https://mail.google.com/*"]
    });
  });
});

async function status(tabId, text, failed = false) {
  await chrome.action.setBadgeText({ tabId, text: failed ? "!" : "" });
  if (failed) await chrome.action.setBadgeBackgroundColor({ tabId, color: "#b91c1c" });
  await chrome.action.setTitle({ tabId, title: failed ? text : DEFAULT_TITLE });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !Number.isInteger(tab?.id)) return;
  if (!/^https:\/\/mail\.google\.com\//.test(info.pageUrl || "")) return;
  void saveImage(info, tab.id);
});

async function saveImage(info, tabId) {
  const options = { frameId: info.frameId ?? 0 };
  try {
    await status(tabId, "");
    const result = await chrome.tabs.sendMessage(tabId, {
      type: "GMAIL_IMAGE_READ", srcUrl: info.srcUrl
    }, options);
    if (!result?.ok) throw new Error(result?.error || t("errorRead"));
    if (!/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(result.dataUrl)
      || result.dataUrl.length > 34 * 1024 * 1024
      || !/^gmail-image-[^<>:"/\\|?*\u0000-\u001f]+\.[a-z]+$/.test(result.filename)) {
      throw new Error(t("errorInvalid"));
    }
    await chrome.downloads.download({
      url: result.dataUrl, filename: result.filename, saveAs: true, conflictAction: "uniquify"
    });
    await chrome.tabs.sendMessage(tabId, {
      type: "GMAIL_IMAGE_NOTICE", text: t("saveLocation")
    }, options).catch(() => {});
  } catch (error) {
    const text = /Receiving end does not exist|Could not establish connection/i.test(error.message)
      ? t("errorRefresh")
      : t("errorSave", error.message);
    await status(tabId, text, true).catch(() => {});
    await chrome.tabs.sendMessage(tabId, { type: "GMAIL_IMAGE_NOTICE", text }, options).catch(() => {});
  }
}
