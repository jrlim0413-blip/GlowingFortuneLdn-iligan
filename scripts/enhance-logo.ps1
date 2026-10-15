Add-Type -AssemblyName System.Drawing
$srcPath = Join-Path $PSScriptRoot "..\public\LB.png"
$destPath = Join-Path $PSScriptRoot "..\public\LB-enhanced.png"

if (Test-Path $srcPath) {
    $src = [System.Drawing.Bitmap]::new($srcPath)
    $w = $src.Width
    $h = $src.Height
    $dest = [System.Drawing.Bitmap]::new($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($dest)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $cm = [System.Drawing.Imaging.ColorMatrix]::new(@(
        [single[]]@(1.15, 0.00, 0.00, 0.00, 0.00),
        [single[]]@(0.00, 1.15, 0.00, 0.00, 0.00),
        [single[]]@(0.00, 0.00, 1.18, 0.00, 0.00),
        [single[]]@(0.00, 0.00, 0.00, 1.00, 0.00),
        [single[]]@(0.04, 0.04, 0.05, 0.00, 1.00)
    ))
    $ia = [System.Drawing.Imaging.ImageAttributes]::new()
    $ia.SetColorMatrix($cm)
    $rect = [System.Drawing.Rectangle]::new(0, 0, $w, $h)
    $g.DrawImage($src, $rect, 0, 0, $w, $h, [System.Drawing.GraphicsUnit]::Pixel, $ia)

    $dest.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $dest.Dispose()
    $src.Dispose()
    Write-Output "SUCCESS: Enhanced LB logo saved to public\LB-enhanced.png"
} else {
    Write-Error "Source file public\LB.png not found"
}
