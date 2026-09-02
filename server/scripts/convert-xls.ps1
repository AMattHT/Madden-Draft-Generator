# Convert the binary .xls launch rosters (Madden 11 on maddenratings.net) in
# cache/launch-rosters to .xlsx with Excel automation, so build-launch-ratings.ts
# can read them. Skips files already converted. Needs Excel installed.
#
#   powershell -ExecutionPolicy Bypass -File scripts/convert-xls.ps1
$dir = Join-Path $PSScriptRoot '..\cache\launch-rosters'
# -Filter *.xls also matches .xlsx on Windows; filter on the exact extension.
$files = Get-ChildItem -Path $dir -File | Where-Object { $_.Extension -eq '.xls' }
if (-not $files) { Write-Output 'no .xls files to convert'; exit 0 }
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$done = 0
try {
  foreach ($f in $files) {
    $target = $f.FullName + 'x'
    if (Test-Path $target) { continue }
    $wb = $excel.Workbooks.Open($f.FullName, 0, $true)
    $wb.SaveAs($target, 51)  # 51 = xlOpenXMLWorkbook
    $wb.Close($false)
    $done++
  }
} finally {
  $excel.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
Write-Output ("converted {0} of {1} .xls files" -f $done, $files.Count)
