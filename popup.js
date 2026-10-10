"use strict";

const t = GmailImageI18n.t;
document.documentElement.lang = chrome.i18n.getUILanguage();
document.documentElement.dir = chrome.i18n.getMessage("@@bidi_dir");
for (const element of document.querySelectorAll("[data-i18n]")) {
  element.textContent = t(element.dataset.i18n);
}
document.getElementById("hint").textContent = t("popupHint", chrome.runtime.getManifest().version);

void (async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const text = await chrome.action.getTitle({ tabId: tab.id });
  if (text && text !== t("extName")) {
    const element = document.getElementById("status");
    element.textContent = text;
    element.hidden = false;
  }
})();
