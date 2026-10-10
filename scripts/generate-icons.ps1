Add-Type -AssemblyName System.Drawing
$iconOutputPath = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Path $iconOutputPath -Force | Out-Null

function New-RoundedPath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
    $shapePath = [System.Drawing.Drawing2D.GraphicsPath]::new()
    [float]$diameter = $radius * 2
    $shapePath.AddArc($x, $y, $diameter, $diameter, 180, 90)
    $shapePath.AddArc(($x + $width - $diameter), $y, $diameter, $diameter, 270, 90)
    $shapePath.AddArc(($x + $width - $diameter), ($y + $height - $diameter), $diameter, $diameter, 0, 90)
    $shapePath.AddArc($x, ($y + $height - $diameter), $diameter, $diameter, 90, 90)
    $shapePath.CloseFigure()
    return ,$shapePath
}

$iconMaster = [System.Drawing.Bitmap]::new(512, 512)
$iconGraphics = [System.Drawing.Graphics]::FromImage($iconMaster)
$iconGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$iconGraphics.ScaleTransform(4, 4)
$tilePath = New-RoundedPath 3 3 122 122 27
$gradientBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.Point]::new(0, 0), [System.Drawing.Point]::new(128, 128),
    [System.Drawing.ColorTranslator]::FromHtml('#3578F6'),
    [System.Drawing.ColorTranslator]::FromHtml('#174BBF')
)
$iconGraphics.FillPath($gradientBrush, $tilePath)
$photoPath = New-RoundedPath 21 24 86 69 11
$iconGraphics.FillPath([System.Drawing.Brushes]::White, $photoPath)
$photoFill = New-RoundedPath 28 31 72 55 5
$skyBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#DCEBFF'))
$iconGraphics.FillPath($skyBrush, $photoFill)
$sunBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#3578F6'))
$iconGraphics.FillEllipse($sunBrush, 37, 40, 13, 13)
$hillBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#78A8FA'))
$hillPoints = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(28, 78), [System.Drawing.PointF]::new(53, 55),
    [System.Drawing.PointF]::new(71, 73), [System.Drawing.PointF]::new(86, 60),
    [System.Drawing.PointF]::new(100, 75), [System.Drawing.PointF]::new(100, 86),
    [System.Drawing.PointF]::new(28, 86)
)
$iconGraphics.FillPolygon($hillBrush, $hillPoints)
$iconGraphics.FillEllipse([System.Drawing.Brushes]::White, 64, 66, 54, 54)
$badgeBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#087C67'))
$iconGraphics.FillEllipse($badgeBrush, 68, 70, 46, 46)
$arrowPen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 6)
$arrowPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$arrowPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$arrowPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$iconGraphics.DrawLine($arrowPen, 91, 80, 91, 100)
$iconGraphics.DrawLines($arrowPen, [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(82, 92), [System.Drawing.PointF]::new(91, 101),
    [System.Drawing.PointF]::new(100, 92)
))
$iconGraphics.Dispose()

foreach ($iconSize in @(16, 32, 48, 128)) {
    $iconBitmap = [System.Drawing.Bitmap]::new($iconSize, $iconSize)
    $resizeGraphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
    $resizeGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $resizeGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $resizeGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $resizeGraphics.DrawImage($iconMaster, [System.Drawing.Rectangle]::new(0, 0, $iconSize, $iconSize))
    $resizeGraphics.Dispose()
    $iconBitmap.Save((Join-Path $iconOutputPath "icon$iconSize.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $iconBitmap.Dispose()
}

foreach ($iconResource in @($iconMaster, $tilePath, $gradientBrush, $photoPath, $photoFill, $skyBrush, $sunBrush, $hillBrush, $badgeBrush, $arrowPen)) {
    $iconResource.Dispose()
}
Get-ChildItem -LiteralPath $iconOutputPath | Select-Object Name, Length
