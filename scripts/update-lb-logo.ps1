Add-Type -AssemblyName System.Drawing

$uploadedPath = 'C:\Users\JAY RYAN LIM\.gemini\antigravity-ide\brain\89d7c1e4-ee6c-4eca-a96b-136149ae85a1\.user_uploaded\media_1790389399347.png'
$publicLbPath = Join-Path $PSScriptRoot "..\public\LB.png"
$publicEnhancedPath = Join-Path $PSScriptRoot "..\public\LB-enhanced.png"

if (-not (Test-Path $uploadedPath)) {
    Write-Error "Uploaded file not found: $uploadedPath"
    exit 1
}

Copy-Item -Path $uploadedPath -Destination $publicLbPath -Force
Write-Output "Copied raw image to $publicLbPath"

$src = [System.Drawing.Bitmap]::new($uploadedPath)
$w = $src.Width
$h = $src.Height
Write-Output "Dimensions: ${w}x${h}"

$dest = [System.Drawing.Bitmap]::new($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

$cornerColor = $src.GetPixel(5, 5)
Write-Output "Background color at corner: R=$($cornerColor.R), G=$($cornerColor.G), B=$($cornerColor.B)"

for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
        $pixel = $src.GetPixel($x, $y)
        if ($pixel.R -ge 245 -and $pixel.G -ge 245 -and $pixel.B -ge 245) {
            $dest.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        } elseif ($pixel.R -ge 230 -and $pixel.G -ge 230 -and $pixel.B -ge 230) {
            $minVal = [Math]::Min($pixel.R, [Math]::Min($pixel.G, $pixel.B))
            $alpha = [int]((255 - $minVal) / 25.0 * 255.0)
            $alpha = [Math]::Max(0, [Math]::Min(255, $alpha))
            $dest.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $pixel.R, $pixel.G, $pixel.B))
        } else {
            $dest.SetPixel($x, $y, $pixel)
        }
    }
}

$dest.Save($publicEnhancedPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Saved transparent enhanced version to $publicEnhancedPath"

$dest.Dispose()
$src.Dispose()
Write-Output "SUCCESS: Both public\LB.png and public\LB-enhanced.png updated!"
