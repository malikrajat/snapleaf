Add-Type -AssemblyName System.Drawing

function New-SnapleafBitmap([int]$Size) {
  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $pad = [double]$Size * 0.035
  $rect = New-Object System.Drawing.RectangleF $pad, $pad, ($Size - 2 * $pad), ($Size - 2 * $pad)
  $radius = [double]$Size * 0.23
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()

  $c1 = [System.Drawing.Color]::FromArgb(255, 74, 168, 255)
  $cMid = [System.Drawing.Color]::FromArgb(255, 30, 144, 255)
  $c2 = [System.Drawing.Color]::FromArgb(255, 11, 99, 199)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $c1, $c2, 45.0
  $blend = New-Object System.Drawing.Drawing2D.ColorBlend 3
  $blend.Colors = @($c1, $cMid, $c2)
  $blend.Positions = @(0.0, 0.55, 1.0)
  $brush.InterpolationColors = $blend
  $g.FillPath($brush, $path)

  $white = [System.Drawing.Color]::FromArgb(244, 239, 247, 255)
  $pen = New-Object System.Drawing.Pen $white, ([float]($Size * 0.052))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  $margin = [float]($Size * 0.245)
  $len = [float]($Size * 0.135)
  $g.DrawLine($pen, $margin, ($margin + $len), $margin, $margin)
  $g.DrawLine($pen, $margin, $margin, ($margin + $len), $margin)
  $g.DrawLine($pen, ($Size - $margin), ($margin + $len), ($Size - $margin), $margin)
  $g.DrawLine($pen, ($Size - $margin), $margin, ($Size - $margin - $len), $margin)
  $g.DrawLine($pen, $margin, ($Size - $margin - $len), $margin, ($Size - $margin))
  $g.DrawLine($pen, $margin, ($Size - $margin), ($margin + $len), ($Size - $margin))
  $g.DrawLine($pen, ($Size - $margin), ($Size - $margin - $len), ($Size - $margin), ($Size - $margin))
  $g.DrawLine($pen, ($Size - $margin), ($Size - $margin), ($Size - $margin - $len), ($Size - $margin))

  $leaf = New-Object System.Drawing.Drawing2D.GraphicsPath
  $sx = [float]($Size / 512.0)
  $leaf.StartFigure()
  $leaf.AddBezier(334 * $sx, 174 * $sx, 272 * $sx, 178 * $sx, 225 * $sx, 226 * $sx, 214 * $sx, 300 * $sx)
  $leaf.AddBezier(214 * $sx, 300 * $sx, 288 * $sx, 289 * $sx, 335 * $sx, 242 * $sx, 334 * $sx, 174 * $sx)
  $leaf.CloseFigure()
  $leafBrush = New-Object System.Drawing.SolidBrush $white
  $g.FillPath($leafBrush, $leaf)

  $vein = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(210, 11, 99, 199)), ([float]($Size * 0.018))
  $vein.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $vein.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawBezier($vein, 226 * $sx, 288 * $sx, 260 * $sx, 258 * $sx, 296 * $sx, 222 * $sx, 326 * $sx, 188 * $sx)

  $dotBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(140, 6, 43, 87))
  $dotSize = [float]($Size * 0.069)
  $g.FillEllipse($dotBrush, [float]($Size * 0.38), [float]($Size * 0.34), $dotSize, $dotSize)

  $dotBrush.Dispose()
  $g.Dispose()
  return $bmp
}

$root = Split-Path -Parent $PSScriptRoot
$resources = Join-Path $root 'resources'
New-Item -ItemType Directory -Force -Path $resources | Out-Null

$large = New-SnapleafBitmap 512
$large.Save((Join-Path $resources 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$large.Dispose()

# Write a multi-resolution ICO with PNG-compressed entries so Windows can use
# the crisp size it needs in the taskbar, Start menu, and file explorer.
function Get-SnapleafPngBytes([int]$Size) {
  $bitmap = New-SnapleafBitmap $Size
  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $stream.ToArray()
  $stream.Dispose()
  $bitmap.Dispose()
  return ,$bytes
}

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = @()
foreach ($size in $sizes) {
  $images += ,(Get-SnapleafPngBytes $size)
}

$icoStream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter $icoStream
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($index = 0; $index -lt $sizes.Count; $index++) {
  $size = $sizes[$index]
  $bytes = $images[$index]
  $dimension = if ($size -ge 256) { 0 } else { $size }
  $writer.Write([byte]$dimension)
  $writer.Write([byte]$dimension)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$bytes.Length)
  $writer.Write([UInt32]$offset)
  $offset += $bytes.Length
}
foreach ($bytes in $images) {
  $writer.Write($bytes)
}
$writer.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $resources 'icon.ico'), $icoStream.ToArray())
$writer.Dispose()
$icoStream.Dispose()

Write-Output "Wrote resources/icon.png and resources/icon.ico"
