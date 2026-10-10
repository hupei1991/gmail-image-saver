"use strict";

(() => {
  if (globalThis.__gmailImageSaverReady) return;
  globalThis.__gmailImageSaverReady = true;
  const utils = GmailImageUtils;
  const t = GmailImageI18n.t;
  let selectedImage = null;
  let notice = null;

  function rememberImage(event) {
    // Gmail places transparent DIVs over selected images. The event path contains
    // the DIV, but the painted element stack still contains the underlying IMG.
    const image = event.composedPath().find(node => node instanceof HTMLImageElement)
      || document.elementsFromPoint(event.clientX, event.clientY)
        .find(node => node instanceof HTMLImageElement);
    selectedImage = image ? {
      element: image, source: image.currentSrc || image.src, time: Date.now()
    } : null;
    return image;
  }

  // Remember early even if another handler later suppresses contextmenu.
  for (const name of ["pointerdown", "mousedown"]) {
    window.addEventListener(name, event => {
      if (event.button === 2) rememberImage(event);
    }, true);
  }
  // Leave the browser's native menu enabled, including the page-context menu.
  window.addEventListener("contextmenu", event => {
    if (rememberImage(event)) event.stopImmediatePropagation();
  }, true);

  function toast(message) {
    notice?.remove();
    notice = document.createElement("div");
    notice.setAttribute("role", "status");
    notice.lang = chrome.i18n.getUILanguage();
    notice.dir = chrome.i18n.getMessage("@@bidi_dir");
    notice.textContent = message;
    Object.assign(notice.style, {
      position: "fixed", bottom: "24px", left: "24px", zIndex: "2147483647",
      background: "#1f2937", color: "white", padding: "12px 18px",
      borderRadius: "10px", font: "14px/1.6 system-ui, sans-serif", maxWidth: "440px",
      boxShadow: "0 4px 24px #0003", pointerEvents: "none"
    });
    document.documentElement.appendChild(notice);
    const current = notice;
    setTimeout(() => { current.remove(); if (notice === current) notice = null; }, 7000);
  }

  function targetImage(srcUrl) {
    const image = selectedImage?.element;
    if (!srcUrl) {
      if (image?.isConnected && Date.now() - selectedImage.time < 120000
        && selectedImage.source === (image.currentSrc || image.src)) return image;
      return null;
    }
    if (image?.isConnected && [image.currentSrc, image.src].includes(srcUrl)) return image;
    return Array.from(document.images).find(img => [img.currentSrc, img.src].includes(srcUrl));
  }

  async function readImage(srcUrl) {
    const image = targetImage(srcUrl);
    if (!image) throw new Error(t("errorNoImage"));
    const source = image.currentSrc || image.src;
    const url = new URL(source, location.href);
    if (!["https:", "blob:", "data:"].includes(url.protocol)) {
      throw new Error(t("errorUploading"));
    }
    toast(t("reading"));
    const response = await fetch(source, {
      credentials: "include", signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(t("errorHTTP", String(response.status)));
    if (Number(response.headers.get("content-length")) > utils.MAX_BYTES) {
      throw new Error(t("errorTooLarge"));
    }
    const blob = await response.blob();
    if (blob.size > utils.MAX_BYTES) throw new Error(t("errorTooLarge"));
    const mime = utils.imageMime(new Uint8Array(await blob.slice(0, 512).arrayBuffer()), blob.type);
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(t("errorFileRead")));
      reader.readAsDataURL(new Blob([blob], { type: mime }));
    });
    let pathName = "";
    try { pathName = decodeURIComponent(url.pathname.split("/").pop() || ""); } catch { /* fallback */ }
    const hint = utils.headerFilename(response.headers.get("content-disposition") || "")
      || (/\.(jpg|jpeg|png|gif|webp|bmp|avif|svg|ico|tiff?)$/i.test(pathName) ? pathName : "");
    return { ok: true, dataUrl, filename: utils.filename(mime, hint) };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === "GMAIL_IMAGE_NOTICE") {
      toast(message.text);
      sendResponse({ ok: true });
      return;
    }
    if (message.type !== "GMAIL_IMAGE_READ") return;
    readImage(message.srcUrl).then(sendResponse).catch(error => {
      const text = error.name === "TimeoutError" ? t("errorTimeout")
        : error instanceof TypeError ? t("errorNetwork")
        : error.message;
      toast(text);
      sendResponse({ ok: false, error: text });
    });
    return true;
  });
})();
