# PDFBox dot-matrix assets

- `om-dot-matrix.png`: dotted Om symbol with transparency
- `truck-dot-matrix.png`: dotted truck and weighbridge symbol with transparency
- Canvas: 1024 x 1024 pixels
- Metadata resolution: 300 DPI
- Ink: dark gray with slightly varied impact-dot sizes

PDFBox example:

```java
PDImageXObject image = PDImageXObject.createFromFileByContent(
    new File("assets/pdfbox-dot-matrix/om-dot-matrix.png"),
    document
);
contentStream.drawImage(image, x, y, width, height);
```

Regenerate both files from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\generate-pdfbox-assets.ps1
```
