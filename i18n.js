"use strict";

globalThis.GmailImageI18n = {
  t(key, substitutions) {
    return chrome.i18n.getMessage(key, substitutions);
  }
};
