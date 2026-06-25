Add-Type -AssemblyName System.Drawing

$outputDirectory = Join-Path $PSScriptRoot '..\assets\pdfbox-dot-matrix'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$size = 1024
$pitch = 12
$dotRadius = 3.7
$ink = [System.Drawing.Color]::FromArgb(220, 48, 48, 44)

function New-Canvas {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bitmap.SetResolution(300, 300)
  return $bitmap
}

function Convert-MaskToDots {
  param(
    [System.Drawing.Bitmap]$Mask,
    [string]$OutputPath
  )

  $output = New-Canvas
  $graphics = [System.Drawing.Graphics]::FromImage($output)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $brush = New-Object System.Drawing.SolidBrush($ink)

  for ($y = [int]($pitch / 2); $y -lt $size; $y += $pitch) {
    for ($x = [int]($pitch / 2); $x -lt $size; $x += $pitch) {
      $darkest = 255
      foreach ($offsetY in @(-3, 0, 3)) {
        foreach ($offsetX in @(-3, 0, 3)) {
          $sampleX = [Math]::Max(0, [Math]::Min($size - 1, $x + $offsetX))
          $sampleY = [Math]::Max(0, [Math]::Min($size - 1, $y + $offsetY))
          $darkest = [Math]::Min($darkest, $Mask.GetPixel($sampleX, $sampleY).R)
        }
      }

      if ($darkest -lt 180) {
        $variation = ((($x * 17 + $y * 31) % 7) - 3) * 0.08
        $radius = $dotRadius + $variation
        $graphics.FillEllipse($brush, $x - $radius, $y - $radius, $radius * 2, $radius * 2)
      }
    }
  }

  $output.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $brush.Dispose()
  $graphics.Dispose()
  $output.Dispose()
}

function New-OmAsset {
  $mask = New-Canvas
  $graphics = [System.Drawing.Graphics]::FromImage($mask)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::White)

  $font = New-Object System.Drawing.Font('Nirmala UI', 600, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $format.FormatFlags = [System.Drawing.StringFormatFlags]::NoClip
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)
  $om = [string][char]0x0950

  $graphics.DrawString($om, $font, $brush, (New-Object System.Drawing.RectangleF(40, 20, 944, 944)), $format)
  Convert-MaskToDots -Mask $mask -OutputPath (Join-Path $outputDirectory 'om-dot-matrix.png')

  $brush.Dispose()
  $format.Dispose()
  $font.Dispose()
  $graphics.Dispose()
  $mask.Dispose()
}

function New-TruckAsset {
  $mask = New-Canvas
  $graphics = [System.Drawing.Graphics]::FromImage($mask)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::White)
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)
  $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 30)

  $graphics.FillRectangle($brush, 120, 390, 480, 220)
  $graphics.FillRectangle($brush, 600, 455, 210, 155)

  $cabinRoof = New-Object 'System.Drawing.Point[]' 3
  $cabinRoof[0] = New-Object System.Drawing.Point(620, 455)
  $cabinRoof[1] = New-Object System.Drawing.Point(690, 335)
  $cabinRoof[2] = New-Object System.Drawing.Point(810, 455)
  $graphics.FillPolygon($brush, $cabinRoof)

  $window = New-Object 'System.Drawing.Point[]' 4
  $window[0] = New-Object System.Drawing.Point(690, 390)
  $window[1] = New-Object System.Drawing.Point(720, 350)
  $window[2] = New-Object System.Drawing.Point(770, 440)
  $window[3] = New-Object System.Drawing.Point(680, 440)
  $graphics.FillPolygon($whiteBrush, $window)

  $graphics.DrawEllipse($pen, 200, 555, 150, 150)
  $graphics.DrawEllipse($pen, 650, 555, 150, 150)
  $graphics.DrawLine($pen, 70, 720, 920, 720)

  Convert-MaskToDots -Mask $mask -OutputPath (Join-Path $outputDirectory 'truck-dot-matrix.png')

  $pen.Dispose()
  $whiteBrush.Dispose()
  $brush.Dispose()
  $graphics.Dispose()
  $mask.Dispose()
}

New-OmAsset
New-TruckAsset

Write-Output "Generated PDFBox assets in $outputDirectory"
