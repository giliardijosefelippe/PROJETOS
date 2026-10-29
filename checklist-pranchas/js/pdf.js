/* Client-side PDF preview. The checklist cross-check does not read drawing geometry. */
(function (root) {
  "use strict";

  var cache = {};
  var token = 0;
  var WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  function buildDidacticPdfBlob() {
    var content = [
      "BT",
      "/F1 22 Tf",
      "48 520 Td",
      "(EXEMPLO DIDATICO) Tj",
      "/F1 12 Tf",
      "0 -32 Td",
      "(PDF gerado no navegador para testar a visualizacao.) Tj",
      "0 -22 Td",
      "(Nao e uma prancha de projeto.) Tj",
      "0 -22 Td",
      "(O painel ao lado cruza o checklist. Nao le o desenho.) Tj",
      "ET"
    ].join("\n");
    var objects = [
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
      "2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n",
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
      "4 0 obj\n<< /Length " + (content.length + 1) + " >>\nstream\n" + content + "\nendstream\nendobj\n",
      "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    ];
    var pdf = "%PDF-1.4\n";
    var offsets = [0];
    objects.forEach(function (object) {
      offsets.push(pdf.length);
      pdf += object;
    });
    var xrefAt = pdf.length;
    var xref = "xref\n0 " + (objects.length + 1) + "\n";
    xref += "0000000000 65535 f \n";
    for (var i = 1; i <= objects.length; i += 1) {
      xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    }
    pdf += xref;
    pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefAt + "\n%%EOF";
    return new Blob([pdf], { type: "application/pdf" });
  }

  function bytesFromDataUrl(dataUrl) {
    var base64 = String(dataUrl).split(",")[1] || "";
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function loadDocument(key, file) {
    if (cache[key]) return cache[key];
    if (!root.pdfjsLib) throw new Error("pdfjs-missing");
    root.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER;
    var data;
    if (file.dataUrl) data = bytesFromDataUrl(file.dataUrl);
    else data = new Uint8Array(await file.blob.arrayBuffer());
    cache[key] = await root.pdfjsLib.getDocument({ data: data }).promise;
    return cache[key];
  }

  async function renderInto(container, key, file, pageNumber) {
    var current = ++token;
    var pdf = await loadDocument(key, file);
    if (current !== token || !container.isConnected) return { pages: pdf.numPages, page: pageNumber };
    var pageIndex = Math.min(Math.max(pageNumber || 1, 1), pdf.numPages);
    var page = await pdf.getPage(pageIndex);
    if (current !== token || !container.isConnected) return { pages: pdf.numPages, page: pageIndex };
    var width = container.clientWidth || 320;
    var base = page.getViewport({ scale: 1 });
    var viewport = page.getViewport({ scale: width / base.width });
    var canvas = document.createElement("canvas");
    var ratio = root.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = viewport.width + "px";
    canvas.style.height = viewport.height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    if (current !== token || !container.isConnected) return { pages: pdf.numPages, page: pageIndex };
    container.replaceChildren(canvas);
    return { pages: pdf.numPages, page: pageIndex };
  }

  function forget(key) {
    delete cache[key];
  }

  root.LunardeliPdf = {
    buildDidacticPdfBlob: buildDidacticPdfBlob,
    renderInto: renderInto,
    forget: forget
  };
})(typeof window !== "undefined" ? window : globalThis);
