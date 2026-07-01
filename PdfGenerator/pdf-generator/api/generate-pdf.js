const clampNumber = (value, fallback, min, max) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
};

const safeFilename = (value) => {
  const filename = String(value || 'weighbridge-slip.pdf')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .trim();

  return filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
};

const buildPdfHtml = ({
  html,
  css,
  pageWidth,
  pageHeight,
  margin,
  sourceWidth,
  sourceHeight,
  origin,
}) => {
  const printableWidth = Math.max(pageWidth - margin * 2, 10);
  const printableHeight = Math.max(pageHeight - margin * 2, 10);
  const pxPerMm = 96 / 25.4;
  const scale = Math.min(
    (printableWidth * pxPerMm) / sourceWidth,
    (printableHeight * pxPerMm) / sourceHeight,
  );

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <base href="${origin || '/'}" />
    <style>
      ${css || ''}
      @page {
        size: ${pageWidth}mm ${pageHeight}mm;
        margin: 0;
      }
      html,
      body {
        width: ${pageWidth}mm;
        height: ${pageHeight}mm;
        margin: 0;
        background: #ffffff;
      }
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      .pdf-page {
        width: ${pageWidth}mm;
        height: ${pageHeight}mm;
        box-sizing: border-box;
        padding: ${margin}mm;
        display: grid;
        place-items: center;
        overflow: hidden;
        background: #ffffff;
      }
      .pdf-preview-wrap {
        width: ${printableWidth}mm;
        height: ${printableHeight}mm;
        display: grid;
        place-items: center;
        overflow: hidden;
      }
      .pdf-preview-wrap > .slip-preview {
        width: ${sourceWidth}px !important;
        min-width: ${sourceWidth}px !important;
        height: ${sourceHeight}px !important;
        margin: 0 !important;
        transform: scale(${scale});
        transform-origin: center center;
      }
    </style>
  </head>
  <body>
    <main class="pdf-page">
      <div class="pdf-preview-wrap">${html || ''}</div>
    </main>
  </body>
</html>`;
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const pageWidth = clampNumber(req.body.pageWidth, 297, 50, 1000);
  const pageHeight = clampNumber(req.body.pageHeight, 210, 50, 1000);
  const margin = clampNumber(req.body.margin, 6, 0, 100);
  const sourceWidth = clampNumber(req.body.sourceWidth, 1000, 100, 5000);
  const sourceHeight = clampNumber(req.body.sourceHeight, 600, 100, 5000);
  const fileName = safeFilename(req.body.fileName);

  let browser;

  try {
    const puppeteer = await import('puppeteer-core');
    const chromium = (await import('@sparticuz/chromium')).default;

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setViewport({
      width: Math.ceil(sourceWidth),
      height: Math.ceil(sourceHeight),
      deviceScaleFactor: 1,
    });
    await page.setContent(buildPdfHtml({
      ...req.body,
      pageWidth,
      pageHeight,
      margin,
      sourceWidth,
      sourceHeight,
    }), {
      waitUntil: ['load', 'networkidle0'],
    });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      await Promise.all(Array.from(document.images).map((image) => (
        image.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              image.onload = resolve;
              image.onerror = resolve;
            })
      )));
    });

    const pdf = await page.pdf({
      width: `${pageWidth}mm`,
      height: `${pageHeight}mm`,
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
    });

    const pdfBuffer = Buffer.from(pdf);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (error) {
    console.error('PDF generation failed:', error);
    return res.status(500).json({ error: 'PDF generation failed.' });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};
