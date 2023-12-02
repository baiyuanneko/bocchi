
import { OCRClient } from 'tesseract-wasm';
import localforage from 'localforage';
import * as bootstrap from 'bootstrap';

enum BrowserType {
  Chrome,
  Firefox,
  Edge,
  OldEdge,
  Safari,
  Opera,
  Other
}

const getBrowserType = function (): BrowserType {
  const userAgent = navigator.userAgent;
  if (userAgent.indexOf("Chrome") > -1) {
    return BrowserType.Chrome;
  }
  if (userAgent.indexOf("Firefox") > -1) {
    return BrowserType.Firefox;
  }
  if (userAgent.indexOf("Edge") > -1) {
    return BrowserType.OldEdge;
  }
  if (userAgent.indexOf("Edg") > -1) {
    return BrowserType.Edge;
  }
  if (userAgent.indexOf("Safari") > -1) {
    return BrowserType.Safari;
  }
  if (userAgent.indexOf("Opera") > -1) {
    return BrowserType.Opera;
  }
  return BrowserType.Other;
}

const downloadingModelModal = new bootstrap.Modal(document.getElementById("downloadingModelModal") as HTMLElement, { backdrop: "static" });
const identifyResultModal = new bootstrap.Modal(document.getElementById("identifyResultModal") as HTMLElement, { backdrop: "static" });
const uiMainArea = document.getElementById("main_area");
const selectImageBtn = document.getElementById("selectImageBtn");
const copyToClipboardBtn = document.getElementById("copyToClipboardBtn");

if (uiMainArea !== null) {
  uiMainArea.addEventListener("drop", async function (event) {
    event.preventDefault();
    event.stopPropagation();
    const files = event.dataTransfer?.files;
    if (files !== undefined) {
      for(let file of files){
        if(file.type.indexOf("image") > -1){
          const bitmap = await createImageBitmap(await new Response(file.stream()).blob());
          tryIdentifyImageBitmap(bitmap);
          break;
        }
      }
    }
    
  })
  uiMainArea.addEventListener("dragover", function (event) {
    event.preventDefault();
    event.stopPropagation();
  });
}

if(copyToClipboardBtn !== null){
  copyToClipboardBtn.onclick = function(){
    copyToClipboard();
  }
}

if (selectImageBtn !== null){
  selectImageBtn.onclick = function(){
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async function(event){
      const files = input.files;
      if(files !== null){
        for(let file of files){
          if(file.type.indexOf("image") > -1){
            const bitmap = await createImageBitmap(await new Response(file.stream()).blob());
            tryIdentifyImageBitmap(bitmap);
            break;
          }
        }
      }
    }
    input.click();
  }
}

const copyToClipboard = function(){
  const identifyResultModalBodyResultArea = document.getElementById("identifyResultModalBodyResultArea") as HTMLTextAreaElement;
  if(identifyResultModalBodyResultArea !== null){
    navigator.clipboard.writeText(identifyResultModalBodyResultArea.value);
  }
}

const getBrowserVersionNumber = function (): number {
  const userAgent = navigator.userAgent;
  const versionNumberString = userAgent.split("/")[1];
  const versionNumber = parseFloat(versionNumberString);
  return versionNumber;
}

const isBrowserFullySupportFileSystemApi = function (): boolean {
  const browserType: BrowserType = getBrowserType();
  const browserVersionNumber: number = getBrowserVersionNumber();
  switch (browserType) {
    case BrowserType.Chrome:
      if (browserVersionNumber >= 86) {
        return true;
      } else {
        return false;
      }
    case BrowserType.Firefox:
      return false;
    case BrowserType.Edge:
      if (browserVersionNumber >= 86) {
        return true;
      } else {
        return false;
      }
    case BrowserType.OldEdge:
      return false;
    case BrowserType.Safari:
      return false;
    case BrowserType.Opera:
      if (browserVersionNumber >= 72) {
        return true;
      } else {
        return false;
      }
    case BrowserType.Other:
      return false;
  }
}

const getModelBuffer = async function (): Promise<ArrayBuffer> {
  return (await localforage.getItem("models") as object)["chi_sim"];
}

const isModelDataInCache = async function (): Promise<boolean> {
  if (await localforage.getItem("models") !== null && (await localforage.getItem("models") as object)["chi_sim"] !== null) {
    return true;
  } else {
    return false;
  }
}

const startModelDownload = function (bitmapToIdentifyThen: ImageBitmap): void {
  downloadingModelModal.show();
  const xhr = new XMLHttpRequest();
  xhr.responseType = "arraybuffer";
  xhr.open('GET', "./models/chi_sim.traineddata", true);

  xhr.addEventListener('progress', (event) => {
    if (event.lengthComputable) {
      const percentage = (event.loaded / event.total) * 100;
      updateProgressOfModelDownloading(percentage);
    }
  });

  xhr.addEventListener('load', async () => {
    await localforage.setItem("models", { "chi_sim": await xhr.response });
    downloadingModelModal.hide();
    startIdentifyImageBitmap(bitmapToIdentifyThen);
  });

  xhr.addEventListener('error', () => {
    console.error('Error during download');
  });

  xhr.send();
}

const updateProgressOfModelDownloading = function (percentage: number) {
  const progressBar = document.getElementById("downloadingModelProgressBar");
  if (progressBar !== null) {
    progressBar.setAttribute("style", `width: ${percentage}%;`);
  }
  const progressText = document.getElementById("downloadingModelProgressText");
  if (progressText !== null) {
    progressText.innerText = `${percentage.toFixed(2)}%`;
  }
}

const removeSpacesAroundChinese = (text: string) => {
  const result = text.replace(/(\S)\s+(\S)/g, function (match, p1, p2) {
    // 只有当空格的左边和右边都是中文字符时才替换为空字符串
    if (/[\u4e00-\u9fa5]/.test(p1) && /[\u4e00-\u9fa5]/.test(p2)) {
      return p1 + p2;
    } else {
      return match;
    }
  });

  return result;
};

const removeSpacesAroundChineseRecursively = (text: string) => {
  let first_text = text;
  let second_text = removeSpacesAroundChinese(first_text);
  while (first_text !== second_text) {
    first_text = second_text;
    second_text = removeSpacesAroundChinese(first_text);
  }
  return second_text;
}

const startIdentifyImageBitmap = async function (bitmap: ImageBitmap) {
  // assumes that the model is already downloaded
  const identifyResultModalBodyResultArea = document.getElementById("identifyResultModalBodyResultArea") as HTMLTextAreaElement;
  const identifyResultModalBodyLoading = document.getElementById("identifyResultModalBodyLoading");
  const identifyResultModalFooter = document.getElementById("identifyResultModalFooter");

  if (identifyResultModalBodyResultArea !== null && identifyResultModalBodyLoading !== null && identifyResultModalFooter !== null) {
    identifyResultModalBodyResultArea.setAttribute("style", "display: none;");
    identifyResultModalBodyLoading.setAttribute("style", "display: block;");
    identifyResultModalFooter.setAttribute("style", "display: none;");
  }
  identifyResultModal.show();
  const startTime = new Date().getTime();
  const ocr = new OCRClient();
  try {
    await ocr.loadModel(await getModelBuffer());
    await ocr.loadImage(bitmap);
    if (identifyResultModalBodyResultArea !== null && identifyResultModalBodyLoading !== null && identifyResultModalFooter !== null) {
      identifyResultModalBodyResultArea.value = removeSpacesAroundChineseRecursively(await ocr.getText());
      identifyResultModalBodyResultArea.setAttribute("style", "width: 100%; height: 350px;");
      identifyResultModalBodyLoading.setAttribute("style", "display: none;");
      identifyResultModalFooter.setAttribute("style", "display: block;");
    }
    const identifyTimeSpentDOM = document.getElementById("identifyTimeSpent");
    if(identifyTimeSpentDOM !== null){
      identifyTimeSpentDOM.innerText = `${((new Date().getTime() - startTime) / 1000).toFixed(1)}s`;
    }
  } finally {
    ocr.destroy();
  }
}

const tryIdentifyImageBitmap = async function (bitmap: ImageBitmap) {
  if (!await isModelDataInCache()) {
    startModelDownload(bitmap);
  } else {
    startIdentifyImageBitmap(bitmap);
  }
}

document.addEventListener("paste", async function (event) {
  const items = (event.clipboardData)?.items;

  if (items !== undefined) {
    for (let item of items) {

      if (item.kind === "file") {
        const blob = await new Response(item.getAsFile()?.stream()).blob();
        if (blob !== undefined) {
          const bitmap = await createImageBitmap(blob);
          tryIdentifyImageBitmap(bitmap);
          break;
        }
      }
    }
  }


});

const registerServiceWorker = async () => {
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      if (registration.installing) {
        console.log("正在安装 Service worker");
      } else if (registration.waiting) {
        console.log("已安装 Service worker installed");
      } else if (registration.active) {
        console.log("激活 Service worker");
      }
    } catch (error) {
      console.error(`注册失败：${error}`);
    }
  }
};

registerServiceWorker();
