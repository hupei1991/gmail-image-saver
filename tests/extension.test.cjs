const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
function mockI18n(locale = 'en-US') {
  const fallback = JSON.parse(read('_locales/en/messages.json'));
  const normalized = locale.replaceAll('-', '_');
  const localePath = path.join(root, '_locales', normalized, 'messages.json');
  const basePath = path.join(root, '_locales', normalized.split('_')[0], 'messages.json');
  const messages = fs.existsSync(localePath) ? JSON.parse(fs.readFileSync(localePath, 'utf8'))
    : fs.existsSync(basePath) ? JSON.parse(fs.readFileSync(basePath, 'utf8')) : fallback;
  return {
    getUILanguage: () => locale,
    getMessage: (key, substitutions = []) => {
      if (key === '@@bidi_dir') return 'ltr';
      const item = messages[key] || fallback[key];
      if (!item) return '';
      const values = Array.isArray(substitutions) ? substitutions : [substitutions];
      return item.message.replace(/\$([a-z_]+)\$/gi, (_, name) => {
        const content = item.placeholders[name.toLowerCase()].content;
        return content.replace(/\$(\d)/g, (_, n) => values[Number(n)-1] ?? '');
      });
    }
  };
}
const sandbox = { TextDecoder, URL, Date, Uint8Array, chrome: {i18n:mockI18n()} };
vm.createContext(sandbox);
vm.runInContext(read('i18n.js'), sandbox);
vm.runInContext(read('image-utils.js'), sandbox);
const utils = sandbox.GmailImageUtils;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=', 'base64');

test('Manifest grants only menus/downloads and injects only on Gmail at document_start', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['contextMenus', 'downloads']);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://mail.google.com/*']);
  assert.equal(manifest.content_scripts[0].run_at, 'document_start');
  for (const file of [...manifest.content_scripts[0].js, manifest.background.service_worker, manifest.action.default_popup]) {
    assert.ok(fs.existsSync(path.join(root, file)));
  }
});

test('Detects PNG/JPEG/GIF/WebP by bytes even with generic MIME', () => {
  assert.equal(utils.imageMime(png, 'application/octet-stream'), 'image/png');
  assert.equal(utils.imageMime(Uint8Array.from([255,216,255,224])), 'image/jpeg');
  assert.equal(utils.imageMime(Buffer.from('GIF89a')), 'image/gif');
  assert.equal(utils.imageMime(Buffer.from('RIFF1234WEBP')), 'image/webp');
});

test('Rejects login/error HTML instead of saving it as an image', () => {
  assert.throws(() => utils.imageMime(Buffer.from('<html>Sign in</html>'), 'image/jpeg'));
  assert.throws(() => utils.imageMime(new Uint8Array(), 'image/png'));
});

test('Sanitizes filenames, retains actual format and decodes Unicode disposition', () => {
  assert.equal(utils.filename('image/jpeg', 'photo.png'), 'gmail-image-photo.jpg');
  assert.equal(utils.filename('image/png', '../../bad:photo?.jpg'), 'gmail-image-_.._bad_photo_.png');
  assert.equal(utils.headerFilename("inline; filename*=UTF-8''%E5%9B%BE%E7%89%87.jpg"), '图片.jpg');
  assert.equal(utils.headerFilename('inline; filename="sample-photo.jpg"'), 'sample-photo.jpg');
  assert.match(utils.filename('image/png', '', new Date('2025-01-01T00:00:00Z')), /^gmail-image-20250101T000000Z\.png$/);
});

function contentHarness({ body = png, mime = 'image/png', size = null, fetchError = null, ok = true, locale = 'en-US' } = {}) {
  let contextListener, messageListener, fetchArgs;
  const listeners = {};
  let hitStack = [];
  class Image {
    constructor(src) { this.src = src; this.currentSrc = src; this.isConnected = true; }
  }
  const image = new Image('https://mail.google.com/mail/u/0?view=fimg&sz=s0-l75-ft&attid=0.1');
  const other = new Image('https://mail.google.com/mail/u/1?view=fimg&attid=0.2');
  class Reader {
    async readAsDataURL(blob) {
      this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
      this.onload();
    }
  }
  const scope = {
    HTMLImageElement: Image, FileReader: Reader,
    URL, Blob, Uint8Array, TextDecoder, AbortSignal, Date, location: { href: 'https://mail.google.com/mail/u/0/' },
    window: { addEventListener: (name, fn, capture) => {
      assert.equal(capture, true); listeners[name] = fn;
      if (name === 'contextmenu') contextListener = fn;
    } },
    document: {
      images: [image, other], elementsFromPoint: () => hitStack,
      documentElement: { appendChild() {} },
      createElement: () => ({ setAttribute() {}, remove() {}, style: {} })
    },
    setTimeout: () => 0,
    fetch: async (...args) => {
      fetchArgs = args;
      if (fetchError) throw fetchError;
      return { ok, status: ok ? 200 : 403,
        headers: { get: name => name === 'content-length' ? String(size ?? body.length) : null },
        blob: async () => new Blob([body], {type: mime}) };
    },
    chrome: { i18n:mockI18n(locale), runtime: { id: 'test-extension', onMessage: { addListener: fn => { messageListener = fn; } } } }
  };
  vm.createContext(scope);
  vm.runInContext(read('i18n.js'), scope);
  vm.runInContext(read('image-utils.js'), scope);
  vm.runInContext(read('content.js'), scope);
  return {
    image, other, scope,
    stack: nodes => { hitStack = nodes; },
    pointerdown: target => listeners.pointerdown({button:2, clientX:10, clientY:10, composedPath:()=>[target]}),
    click: target => { let stopped = false; contextListener({ clientX:10, clientY:10, composedPath: () => [target], stopImmediatePropagation: () => { stopped = true; } }); return stopped; },
    read: srcUrl => new Promise(resolve => messageListener({type:'GMAIL_IMAGE_READ', srcUrl}, {id:'test-extension'}, resolve)),
    fetchArgs: () => fetchArgs
  };
}

test('Right click restores browser menu only for an image; leaves text alone', () => {
  const h = contentHarness();
  assert.equal(h.click(h.image), true);
  assert.equal(h.click({}), false);
});

test('Reads exact original URL with credentials; saved bytes match input without canvas', async () => {
  const h = contentHarness();
  h.click(h.image);
  const result = await h.read(h.image.src);
  assert.equal(result.ok, true);
  assert.deepEqual(Buffer.from(result.dataUrl.split(',')[1], 'base64'), png);
  assert.equal(h.fetchArgs()[0], h.image.src);
  assert.equal(h.fetchArgs()[1].credentials, 'include');
  assert.match(result.filename, /\.png$/);
});

test('Does not save previously selected image after right clicking a different image', async () => {
  const h = contentHarness();
  h.click(h.image);
  h.click(h.other);
  const result = await h.read(h.other.src);
  assert.equal(result.ok, true);
  assert.equal(h.fetchArgs()[0], h.other.src);
});

test('Rejects arbitrary URLs not present as images in this Gmail document', async () => {
  const h = contentHarness();
  const result = await h.read('https://mail.google.com/private-other-resource');
  assert.equal(result.ok, false);
  assert.equal(h.fetchArgs(), undefined);
});

test('Gmail DIV overlay and page menu without srcUrl still save the clicked image', async () => {
  const h = contentHarness();
  const overlay = {};
  h.stack([overlay, {}, h.image]);
  assert.equal(h.click(overlay), true);
  const result = await h.read(undefined);
  assert.equal(result.ok, true);
  assert.equal(h.fetchArgs()[0], h.image.src);
  assert.deepEqual(Buffer.from(result.dataUrl.split(',')[1], 'base64'), png);
});

test('Right-button pointerdown records the image when contextmenu is intercepted', async () => {
  const h = contentHarness();
  h.stack([{}, h.other]);
  h.pointerdown({});
  assert.equal((await h.read(undefined)).ok, true);
  assert.equal(h.fetchArgs()[0], h.other.src);
});

test('Right clicking blank space clears the previous image and never downloads it', async () => {
  const h = contentHarness();
  h.click(h.image);
  h.stack([]);
  h.click({});
  const result = await h.read(undefined);
  assert.equal(result.ok, false);
  assert.equal(h.fetchArgs(), undefined);
});

test('Overlay target is rejected if its image source changed before saving', async () => {
  const h = contentHarness();
  h.stack([{}, h.image]);
  h.click({});
  h.image.currentSrc = 'https://mail.google.com/new-image';
  assert.equal((await h.read(undefined)).ok, false);
  assert.equal(h.fetchArgs(), undefined);
});

test('Rejects HTML and over-limit images with actionable errors', async () => {
  const html = contentHarness({body: Buffer.from('<html>Login</html>'), mime:'text/html'});
  assert.equal((await html.read(html.image.src)).ok, false);
  const big = contentHarness({size: utils.MAX_BYTES + 1});
  assert.match((await big.read(big.image.src)).error, /24 MB/);
  const denied = contentHarness({ok:false});
  assert.match((await denied.read(denied.image.src)).error, /403/);
});

function workerHarness(result, downloadError = null, locale = 'en-US') {
  let clicked, installed;
  const calls = {downloads:[], badges:[], titles:[], messages:[], menu:null};
  const chrome = {
    i18n:mockI18n(locale),
    runtime: { onInstalled: {addListener: fn => installed = fn} },
    contextMenus: {
      removeAll: fn => fn(), create: menu => calls.menu = menu,
      onClicked: {addListener: fn => clicked = fn}
    },
    action: {
      setBadgeText: async x => { calls.badges.push(x); },
      setBadgeBackgroundColor: async () => {},
      setTitle: async x => { calls.titles.push(x); }
    },
    tabs: {sendMessage: async (id, message, options) => { calls.messages.push({id,message,options}); return result; }},
    downloads: {download: async options => { calls.downloads.push(options); if(downloadError) throw downloadError; return 7; }}
  };
  const scope = {chrome, console};
  vm.createContext(scope);
  scope.importScripts = (...files) => files.forEach(file => vm.runInContext(read(file), scope));
  vm.runInContext(read('background.js'), scope);
  return { calls, scope, installed: () => installed(), clicked: (info, tab) => clicked(info,tab) };
}

const clickInfo = {menuItemId:'gmail-save-original-image', pageUrl:'https://mail.google.com/mail/u/0/', frameId:3, srcUrl:'https://mail.google.com/image'};
const goodResult = {ok:true, dataUrl:`data:image/png;base64,${png.toString('base64')}`, filename:'gmail-image-test.png'};

test('Registers Gmail-only menu for all contexts; asks Chrome for Save As and avoids overwrite', async () => {
  const h = workerHarness(goodResult);
  h.installed();
  assert.deepEqual(Array.from(h.calls.menu.contexts), ['all']);
  assert.deepEqual(Array.from(h.calls.menu.documentUrlPatterns), ['https://mail.google.com/*']);
  await h.scope.saveImage(clickInfo, 5);
  assert.equal(h.calls.messages[0].options.frameId, 3);
  assert.equal(h.calls.downloads[0].saveAs, true);
  assert.equal(h.calls.downloads[0].conflictAction, 'uniquify');
  assert.deepEqual(Buffer.from(h.calls.downloads[0].url.split(',')[1], 'base64'), png);
});

test('Rejected payloads never start a download; shows a badge and error notice', async () => {
  for (const result of [
    {ok:false, error:'读取失败'},
    {...goodResult, dataUrl:'https://malicious.example/file'},
    {...goodResult, filename:'../../escape.png'}
  ]) {
    const h = workerHarness(result);
    await h.scope.saveImage(clickInfo, 5);
    assert.equal(h.calls.downloads.length, 0);
    assert.equal(h.calls.badges.at(-1).text, '!');
    assert.equal(h.calls.messages.at(-1).message.type, 'GMAIL_IMAGE_NOTICE');
  }
});

test('Download startup failure is displayed rather than reporting success', async () => {
  const h = workerHarness(goodResult, new Error('Download failed'));
  await h.scope.saveImage(clickInfo, 5);
  assert.equal(h.calls.titles.at(-1).title, 'Could not save the image: Download failed');
  assert.equal(h.calls.badges.at(-1).text, '!');
});

test('Other websites cannot invoke Gmail download through the menu', () => {
  const h = workerHarness(goodResult);
  h.clicked({...clickInfo, pageUrl:'https://mail.google.com.attacker.example/'}, {id:5});
  assert.equal(h.calls.messages.length, 0);
});

test('All translations contain every used message and identical placeholder definitions', () => {
  const catalogs = ['en', 'zh_CN', 'zh_TW'].map(locale => JSON.parse(read(`_locales/${locale}/messages.json`)));
  const keys = Object.keys(catalogs[0]).sort();
  for (const catalog of catalogs) {
    assert.deepEqual(Object.keys(catalog).sort(), keys);
    for (const key of keys) {
      assert.ok(catalog[key].message.trim());
      assert.deepEqual(catalog[key].placeholders || {}, catalogs[0][key].placeholders || {});
    }
  }
  const scripts = ['background.js','content.js','image-utils.js','popup.js','i18n.js'];
  const refs = scripts.flatMap(file => [...read(file).matchAll(/\bt\("([a-zA-Z]+)"/g)].map(m => m[1]));
  refs.push(...[...read('popup.html').matchAll(/data-i18n="([a-zA-Z]+)"/g)].map(m => m[1]));
  refs.push(...[...JSON.stringify(manifest).matchAll(/__MSG_([a-zA-Z]+)__/g)].map(m => m[1]));
  for (const key of refs) assert.ok(catalogs[0][key], `Missing translation: ${key}`);
  for (const file of scripts) assert.doesNotMatch(read(file), /[\u3400-\u9fff]/, `Hardcoded Chinese in ${file}`);
});

test('Manifest localizes metadata and declares valid PNG icons at all intended sizes', () => {
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.name, '__MSG_extName__');
  assert.equal(manifest.description, '__MSG_extDescription__');
  assert.equal(manifest.action.default_title, '__MSG_extName__');
  assert.deepEqual(Object.keys(manifest.icons), ['16','32','48','128']);
  for (const [size, file] of Object.entries(manifest.icons)) {
    const bytes = fs.readFileSync(path.join(root,file));
    assert.equal(utils.imageMime(bytes), 'image/png');
    assert.equal(bytes.readUInt32BE(16), Number(size));
    assert.equal(bytes.readUInt32BE(20), Number(size));
    assert.equal(bytes[25], 6, 'RGBA icon preserves transparent rounded corners');
  }
  for (const [size,file] of Object.entries(manifest.action.default_icon)) assert.equal(manifest.icons[size],file);
});

for (const [locale, menu, title] of [
  ['en-US','Save Gmail image…','Gmail Image Saver'],
  ['en-GB','Save Gmail image…','Gmail Image Saver'],
  ['zh-CN','保存 Gmail 图片…','Gmail 图片右键下载'],
  ['zh-TW','儲存 Gmail 圖片…','Gmail 圖片右鍵下載'],
  ['de-DE','Save Gmail image…','Gmail Image Saver']
]) {
  test(`${locale}: menu, default title, content errors and HTTP placeholders use the browser locale`, async () => {
    const worker = workerHarness(goodResult, null, locale);
    worker.installed();
    assert.equal(worker.calls.menu.title, menu);
    await worker.scope.saveImage(clickInfo,5);
    assert.equal(worker.calls.titles[0].title, title);
    assert.equal(worker.calls.messages.at(-1).message.text, mockI18n(locale).getMessage('saveLocation'));
    const content = contentHarness({locale, ok:false});
    const result = await content.read(content.image.src);
    assert.equal(result.error, mockI18n(locale).getMessage('errorHTTP', '403'));
    assert.ok(result.error.includes('403'));
  });

  test(`${locale}: popup localizes all labels, version, document language and error text`, async () => {
    const labels = ['extName','popupHeading','popupInstructions','privacy'].map(key=>({dataset:{i18n:key},textContent:''}));
    const hint = {textContent:''};
    const status = {textContent:'',hidden:true};
    const doc = {
      documentElement:{},
      querySelectorAll:()=>labels,
      getElementById:id=>id === 'hint' ? hint : status
    };
    const i18n = mockI18n(locale);
    const errorText = i18n.getMessage('errorRefresh');
    const scope = {document:doc, chrome:{i18n,
      runtime:{getManifest:()=>manifest},
      tabs:{query:async()=>[{id:5}]}, action:{getTitle:async()=>errorText}
    }};
    vm.createContext(scope);
    vm.runInContext(read('i18n.js'),scope);
    vm.runInContext(read('popup.js'),scope);
    await new Promise(resolve=>setImmediate(resolve));
    for (const label of labels) assert.equal(label.textContent,i18n.getMessage(label.dataset.i18n));
    assert.equal(hint.textContent,i18n.getMessage('popupHint',manifest.version));
    assert.ok(hint.textContent.includes('1.0.2'));
    assert.equal(doc.documentElement.lang,locale);
    assert.equal(doc.documentElement.dir,'ltr');
    assert.equal(status.hidden,false);
    assert.equal(status.textContent,errorText);
  });
}
