"use strict";

const os = require("os");
const fs = require("fs");
const path = require("path");
const request = require("@derhuerst/http-basic");
const ProgressBar = require("progress");

const imPath = require(".").path;
const fileName = path.basename(getStaticUrl());
const filePath = path.join(imPath, fileName);

const exitOnError = (err) => {
  console.error(err);
  process.exit(1);
};

const exitOnErrorOrWarnWith = (msg) => (err) => {
  if (err.statusCode === 404) console.warn(msg);
  else exitOnError(err);
};

try {
  if (fs.existsSync(filePath)) {
    fs.rmdirSync(imPath, { recursive: true });
  }

  // 防止重复安装
  if (fs.existsSync(imPath)) {
    process.exit(0);
  }
} catch (err) {
  if (err && err.code !== "ENOENT") exitOnError(err);
}

let agent = false;
const proxyUrl =
  process.env.npm_config_https_proxy || process.env.npm_config_proxy;
if (proxyUrl) {
  const HttpsProxyAgent = require("https-proxy-agent");
  const { hostname, port, protocol } = new URL(proxyUrl);
  agent = new HttpsProxyAgent({ hostname, port, protocol });
}

const noop = () => {};
function downloadFile(url, destinationPath, progressCallback = noop) {
  let fulfill, reject;
  let totalBytes = 0;

  const promise = new Promise((x, y) => {
    fulfill = x;
    reject = y;
  });

  request(
    "GET",
    url,
    {
      agent,
      followRedirects: true,
      maxRedirects: 3,
      gzip: true,
      timeout: 30 * 1000, // 30s
      retry: true,
    },
    (err, response) => {
      if (err || response.statusCode !== 200) {
        err = err || new Error("下载失败");
        if (response) {
          err.url = response.url;
          err.statusCode = response.statusCode;
        }
        return reject(err);
      }

      fs.mkdirSync(destinationPath, { recursive: true });

      const file = fs.createWriteStream(filePath);
      file.on("finish", () => fulfill());
      file.on("error", (error) => reject(error));
      response.body.pipe(file);

      if (progressCallback) {
        const cLength = response.headers["content-length"];
        totalBytes = cLength ? parseInt(cLength, 10) : null;
        response.body.on("data", (chunk) => {
          progressCallback(chunk.length, totalBytes);
        });
      }
    }
  );

  return promise;
}

// 解压文件
function unCompress(source, target, isDelete) {
  // 解压
  const compressing = require("compressing");

  if (fileName.indexOf("zip") !== -1) {
    compressing.zip.uncompress(source, target).then(() => {
      if (isDelete) {
        fs.unlinkSync(source);
      }
    });
  }

  if (fileName.indexOf("gz") !== -1) {
    compressing.gzip.uncompress(source, target).then(() => {
      if (isDelete) {
        fs.unlinkSync(source);
      }
    });
  }
}

function getStaticUrl() {
  // windows
  if (os.platform() === "win32") {
    return "https://github.com/y2zz-info/imagemagick-static/releases/download/0.0.1/ImageMagick-7.0.10-52-portable-Q16-HDRI-x86.zip";
  }

  // macos
  if (os.platform() === "darwin") {
    return "https://github.com/y2zz-info/imagemagick-static/releases/download/0.0.1/ImageMagick-x86_64-apple-darwin20.1.0.tar.gz";
  }
}

// 处理进度条
let progressBar = null;
const progressHandler = (deltaBytes, totalBytes) => {
  if (totalBytes === null) return;
  if (!progressBar) {
    progressBar = new ProgressBar(`[:bar] :percent :etas `, {
      complete: "■",
      incomplete: " ",
      width: 30,
      total: totalBytes,
    });
  }

  progressBar.tick(deltaBytes);
};

// 下载文件
downloadFile(getStaticUrl(), imPath, progressHandler)
  .then(() => {
    fs.chmodSync(imPath, 0o755); // make executable
    unCompress(filePath, imPath, true);
  })
  .catch(exitOnError);
