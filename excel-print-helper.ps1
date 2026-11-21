# PMS 공정검사보고서 Excel 인쇄 미리보기 로컬 도우미 (포트 18520)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$port = 18520
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Start()

$tempDir = Join-Path $env:TEMP 'pms_print_preview'
if (-not (Test-Path $tempDir)) {
  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
}

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  PMS Excel Print Preview Helper (Port: $port)" -ForegroundColor Cyan
Write-Host "  이 창을 켜두면 웹에서 [출력] 시 Excel 미리보기가 열립니다." -ForegroundColor Gray
Write-Host "====================================================" -ForegroundColor Cyan

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    $res.Headers.Add('Access-Control-Allow-Origin', '*')
    $res.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    $res.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
    $res.Headers.Add('Access-Control-Allow-Private-Network', 'true')

    if ($req.HttpMethod -eq 'OPTIONS') {
      $res.StatusCode = 204
      $res.Close()
      continue
    }

    if ($req.Url.LocalPath -eq '/health') {
      $buf = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
      $res.ContentType = 'application/json; charset=utf-8'
      $res.ContentLength64 = $buf.Length
      $res.OutputStream.Write($buf, 0, $buf.Length)
      $res.Close()
      continue
    }

    if ($req.HttpMethod -eq 'POST' -and $req.Url.LocalPath -eq '/print-preview') {
      $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
      $bodyText = $reader.ReadToEnd()
      $reader.Close()

      $payload = $bodyText | ConvertFrom-Json
      $rawName = [string]($payload.fileName)
      if ([string]::IsNullOrWhiteSpace($rawName)) { $rawName = "report_$(Get-Date -Format 'yyyyMMdd_HHmmss').xlsx" }
      $safeName = [System.IO.Path]::GetFileName($rawName)
      $outPath = Join-Path $tempDir $safeName

      $bytes = [System.Convert]::FromBase64String([string]$payload.base64)
      [System.IO.File]::WriteAllBytes($outPath, $bytes)

      # 응답을 먼저 반환하여 브라우저 대기 방지
      $okBuf = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
      $res.ContentType = 'application/json; charset=utf-8'
      $res.ContentLength64 = $okBuf.Length
      $res.OutputStream.Write($okBuf, 0, $okBuf.Length)
      $res.Close()

      Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Excel 미리보기 실행: $safeName" -ForegroundColor Green

      # Excel COM 실행 및 인쇄 미리보기 (임시 ps1 파일로 비동기 실행하여 따옴표 깨짐 및 블로킹 방지)
      $previewScript = Join-Path $tempDir 'run_preview.ps1'
      $errLog = Join-Path $tempDir 'preview_error.log'
      $escapedOut = $outPath -replace "'", "''"
      $escapedErr = $errLog -replace "'", "''"
      $scriptBody = @"
`$ErrorActionPreference = 'Stop'
try {
  `$excel = New-Object -ComObject Excel.Application
  `$excel.Visible = `$true
  `$excel.DisplayAlerts = `$false
  `$wb = `$excel.Workbooks.Open('$escapedOut')
  `$ws = `$wb.Worksheets.Item(1)
  `$ws.Activate() | Out-Null
  `$excel.WindowState = -4137
  try {
    Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class WinApi { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); }' -ErrorAction SilentlyContinue
    [WinApi]::SetForegroundWindow([IntPtr]`$excel.Hwnd) | Out-Null
  } catch {}
  `$ws.PrintPreview(`$true)
} catch {
  "[`$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] `$(`$_.Exception.Message)" | Out-File -FilePath '$escapedErr' -Append -Encoding utf8
  Start-Process '$escapedOut'
}
"@
      [System.IO.File]::WriteAllText($previewScript, $scriptBody, [System.Text.Encoding]::UTF8)
      Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $previewScript
      continue
    }

    $res.StatusCode = 404
    $res.Close()
  } catch {
    Write-Host "요청 처리 오류: $($_.Exception.Message)" -ForegroundColor Yellow
    try { $ctx.Response.StatusCode = 500; $ctx.Response.Close() } catch {}
  }
}
