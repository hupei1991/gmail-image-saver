"use strict";

globalThis.GmailImageUtils = (() => {
  const t = GmailImageI18n.t;
  const MAX_BYTES = 24 * 1024 * 1024;
  const extensions = {
    "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
    "image/webp": "webp", "image/bmp": "bmp", "image/avif": "avif",
    "image/svg+xml": "svg", "image/x-icon": "ico", "image/tiff": "tif"
  };

  function imageMime(bytes, declared = "") {
    const b = bytes;
    const ascii = (start, end) => String.fromCharCode(...b.slice(start, end));
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)) return "image/png";
    if (/^GIF8[79]a$/.test(ascii(0, 6))) return "image/gif";
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
    if (ascii(0, 2) === "BM") return "image/bmp";
    if (["II*\u0000", "MM\u0000*"].includes(ascii(0, 4))) return "image/tiff";
    if (ascii(4, 8) === "ftyp" && /avif|avis/.test(ascii(8, 64))) return "image/avif";
    if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return "image/x-icon";
    const type = declared.split(";")[0].trim().toLowerCase();
    if (type === "image/svg+xml" && /<svg[\s>]/i.test(new TextDecoder().decode(b))) return type;
    throw new Error(t("errorNotImage"));
  }

  function filename(mime, hint = "", now = new Date()) {
    const ext = extensions[mime];
    if (!ext) throw new Error(t("errorFormat"));
    const clean = hint.normalize("NFKC").replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_")
      .replace(/\.[a-z0-9]{1,8}$/i, "").replace(/^[. ]+|[. ]+$/g, "").slice(0, 80);
    const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    return `gmail-image-${clean || stamp}.${ext}`;
  }

  function headerFilename(value = "") {
    const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(value);
    if (encoded) {
      try { return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, "")); } catch { /* use plain name */ }
    }
    return /filename\s*=\s*"([^"]+)"/i.exec(value)?.[1]
      || /filename\s*=\s*([^;]+)/i.exec(value)?.[1]?.trim() || "";
  }

  return { MAX_BYTES, imageMime, filename, headerFilename };
})();
