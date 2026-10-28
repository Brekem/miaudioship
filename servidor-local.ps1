# Servidor local para probar Mi Audioship en http://localhost:8080 (Ctrl+C para cerrar).
param([int]$Puerto = 8080)
$raiz = $PSScriptRoot
$tipos = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.wasm' = 'application/wasm'; '.svg' = 'image/svg+xml'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.ico' = 'image/x-icon'; '.md' = 'text/plain; charset=utf-8' }
$l = New-Object Net.HttpListener
$l.Prefixes.Add("http://localhost:$Puerto/")
$l.Start()
Write-Host "Mi Audioship en http://localhost:$Puerto  (Ctrl+C para cerrar)"
try {
  while ($l.IsListening) {
    $c = $l.GetContext()
    try {
      $ruta = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath.TrimStart('/'))
      if (-not $ruta) { $ruta = 'index.html' }
      $f = [IO.Path]::GetFullPath((Join-Path $raiz $ruta))
      if ($f.StartsWith($raiz) -and (Test-Path -LiteralPath $f -PathType Leaf)) {
        $t = $tipos[[IO.Path]::GetExtension($f).ToLower()]; if ($t) { $c.Response.ContentType = $t }
        $c.Response.Headers['Cache-Control'] = 'no-cache'
        if ($c.Request.HttpMethod -ne 'HEAD') {
          $b = [IO.File]::ReadAllBytes($f)
          $c.Response.OutputStream.Write($b, 0, $b.Length)
        }
      } else { $c.Response.StatusCode = 404 }
    } catch { Write-Host "Error en $($c.Request.Url): $_" }
    try { $c.Response.Close() } catch { }
  }
} finally { $l.Stop() }
