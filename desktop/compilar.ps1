# Compila MiAudioship.exe con el compilador de C# que trae Windows (.NET Framework 4).
# Uso: powershell -ExecutionPolicy Bypass -File desktop\compilar.ps1
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$salida = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Force $salida | Out-Null
$csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework64\v4*\csc.exe" | Select-Object -Last 1
if (-not $csc) { throw 'No se encontro csc.exe (.NET Framework 4)' }

# Icono: cuadro rojo redondeado con triangulo de "play"
$ico = Join-Path $salida 'icono.ico'
Add-Type -AssemblyName System.Drawing
$tamanos = 16, 32, 48, 256
$pngs = foreach ($t in $tamanos) {
  $bmp = New-Object Drawing.Bitmap $t, $t
  $g = [Drawing.Graphics]::FromImage($bmp); $g.SmoothingMode = 'AntiAlias'
  $r = [math]::Max(2, [int]($t * 0.22)); $p = New-Object Drawing.Drawing2D.GraphicsPath
  $p.AddArc(0, 0, $r * 2, $r * 2, 180, 90); $p.AddArc($t - $r * 2 - 1, 0, $r * 2, $r * 2, 270, 90)
  $p.AddArc($t - $r * 2 - 1, $t - $r * 2 - 1, $r * 2, $r * 2, 0, 90); $p.AddArc(0, $t - $r * 2 - 1, $r * 2, $r * 2, 90, 90); $p.CloseFigure()
  $g.FillPath((New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(255, 59, 48))), $p)
  $tri = [Drawing.PointF[]]@((New-Object Drawing.PointF ($t * .38), ($t * .28)), (New-Object Drawing.PointF ($t * .38), ($t * .72)), (New-Object Drawing.PointF ($t * .74), ($t * .5)))
  $g.FillPolygon([Drawing.Brushes]::White, $tri); $g.Dispose()
  $ms = New-Object IO.MemoryStream; $bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose(); , $ms.ToArray()
}
$fs = [IO.File]::Create($ico); $bw = New-Object IO.BinaryWriter $fs
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$tamanos.Count)
$off = 6 + 16 * $tamanos.Count
for ($i = 0; $i -lt $tamanos.Count; $i++) {
  $t = $tamanos[$i]; $b = if ($t -ge 256) { 0 } else { $t }
  $bw.Write([byte]$b); $bw.Write([byte]$b); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([uint16]1); $bw.Write([uint16]32); $bw.Write([uint32]$pngs[$i].Length); $bw.Write([uint32]$off); $off += $pngs[$i].Length
}
foreach ($png in $pngs) { $bw.Write($png) }
$bw.Close()

# Archivos de la pagina incrustados como recursos "web/<ruta>"
$web = @('index.html', 'app.js') + (Get-ChildItem (Join-Path $raiz 'vendor') -Recurse -File | % { $_.FullName.Substring($raiz.Length + 1).Replace('\', '/') })
$recursos = $web | % { '/resource:"' + (Join-Path $raiz $_) + '",web/' + $_ }

$exe = Join-Path $salida 'MiAudioship.exe'
& $csc.FullName /nologo /target:winexe /optimize+ /out:$exe /win32icon:$ico `
  /r:System.Windows.Forms.dll /r:System.Drawing.dll @recursos (Join-Path $PSScriptRoot 'Program.cs')
if ($LASTEXITCODE) { throw 'Fallo la compilacion' }
Remove-Item $ico
"Listo: $exe ($([math]::Round((Get-Item $exe).Length / 1KB)) KB)"
