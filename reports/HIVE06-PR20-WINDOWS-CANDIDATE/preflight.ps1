# Diagnostic only. No installer, RPC, database connection, token read or process control.
[CmdletBinding()]
param(
  [string]$TrialRoot = 'F:\0 codex\Hive-PCP-Dev-Trial-001',
  [string]$CandidateRoot = 'F:\0 codex\Hive-V06-PR20-Final'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$results = [System.Collections.Generic.List[object]]::new()
function Record($name, $state, $detail) {
  $results.Add([pscustomobject]@{ check=$name; status=$state; detail=$detail })
}
function Check($name, [scriptblock]$body) {
  try { & $body; Record $name 'PASS' 'Observed by read-only check' }
  catch { Record $name 'BLOCKED' 'Missing, inaccessible, inconsistent or unsafe evidence; inspect locally without publishing raw files' }
}
function Require($condition) { if (!$condition) { throw 'Evidence mismatch' } }
function ReadJson($path) { Get-Content -LiteralPath $path -Raw | ConvertFrom-Json }
function Hash($path) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
function TextHash($value) {
  $h = [Security.Cryptography.SHA256]::Create()
  try { -join ($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($value)) | ForEach-Object { $_.ToString('x2') }) }
  finally { $h.Dispose() }
}
function SafeFile($base, $relative) {
  Require (![IO.Path]::IsPathRooted($relative))
  $base = [IO.Path]::GetFullPath($base).TrimEnd('\')
  $path = [IO.Path]::GetFullPath((Join-Path $base $relative))
  Require ($path.StartsWith($base + '\', [StringComparison]::OrdinalIgnoreCase))
  $item = Get-Item -LiteralPath $path
  Require (!$item.PSIsContainer)
  $cursor = $path
  while ($cursor) {
    $item = Get-Item -LiteralPath $cursor
    Require (!($item.Attributes -band [IO.FileAttributes]::ReparsePoint))
    $parent = [IO.Directory]::GetParent($cursor)
    if ($null -eq $parent) { break }
    $cursor = $parent.FullName
  }
  [IO.Path]::GetFullPath((Join-Path $base $relative))
}
function ExtensionId($key) {
  $h = [Security.Cryptography.SHA256]::Create()
  try { $hex = -join ($h.ComputeHash([Convert]::FromBase64String($key))[0..15] | ForEach-Object { $_.ToString('x2') }) }
  finally { $h.Dispose() }
  -join ($hex.ToCharArray() | ForEach-Object { [char](97 + [Convert]::ToInt32([string]$_,16)) })
}
$sha = '0afa0654799e18d1d0b5c3b8c8fb1cdd03c5187a'
$t = $null; $app = $null; $release = $null; $oldManifest = $null
Check 'Windows host' { Require ($env:OS -eq 'Windows_NT') }
Check 'trial identity / source / versions' {
  $script:TrialRoot = (Get-Item -LiteralPath $TrialRoot).FullName.TrimEnd('\')
  $script:t = ReadJson (Join-Path $TrialRoot 'trial.json')
  Require ($t.root.TrimEnd('\') -ieq $TrialRoot)
  Require ($t.sourceSha -match '^[0-9a-f]{40}$')
  $id = (TextHash ((Join-Path $TrialRoot 'data').Replace('\','/').ToLowerInvariant())).Substring(0,16)
  Require ($t.instanceId -ceq $id); Require ($t.host -ceq "com.charterion.pcp_trial_$id")
  $script:app = Join-Path $TrialRoot ('versions\' + $t.sourceSha)
  Require (Test-Path -LiteralPath $app -PathType Container)
  Record 'observed source (historical SHA is not assumed)' 'INFO' $t.sourceSha
  Record 'instance / host / extension' 'INFO' "$($t.instanceId) / $($t.host) / $($t.extensionId)"
}
Check 'installed release full file hashes and key' {
  Require ($null -ne $app)
  $script:release = ReadJson (Join-Path $app 'release.json')
  Require ($release.sourceSha -ceq $t.sourceSha); Require ($release.instanceId -ceq $t.instanceId)
  Require ($release.host -ceq $t.host); Require ($release.extensionId -ceq $t.extensionId)
  Require (@($release.files.PSObject.Properties).Count -gt 0)
  foreach ($p in $release.files.PSObject.Properties) { Require ((Hash (SafeFile $app $p.Name)) -ceq $p.Value) }
  $script:oldManifest = ReadJson (SafeFile $app 'manifest.json')
  Require ((ExtensionId $oldManifest.key) -ceq $t.extensionId)
  Record 'installed release manifest SHA256' 'INFO' (Hash (Join-Path $app 'release.json'))
}
Check 'HKCU actual registration / native config / same pipe' {
  Require ($null -ne $t)
  $key = Get-Item -LiteralPath ('Registry::HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\' + $t.host)
  $path = [string]$key.GetValue('')
  Require ($path -ieq (Join-Path $app ('native-host\' + $t.host + '.json')))
  $registration = ReadJson $path
  Require ($registration.name -ceq $t.host); Require ($registration.type -ceq 'stdio')
  Require ($registration.path -ieq (Join-Path $app 'native-host\GamNativeHost.exe'))
  Require (@($registration.allowed_origins).Count -eq 1)
  Require ($registration.allowed_origins[0] -ceq "chrome-extension://$($t.extensionId)/")
  $n = ReadJson (SafeFile $app 'native-host\gam-native-host.json')
  Require ($n.instanceId -ceq $t.instanceId)
  Require ($n.pipeName -ceq "\\.\pipe\charterion-$($t.instanceId)")
  Require ($n.allowedOrigin -ceq $registration.allowed_origins[0])
  Require ($n.browserTokenPath -ieq (Join-Path $TrialRoot 'data\browser.token'))
  Require (Test-Path -LiteralPath $n.browserTokenPath -PathType Leaf)
  Record 'actual registered manifest' 'INFO' $path
}
Check 'Kernel PID ownership / executable / source' {
  $s = ReadJson (Join-Path $TrialRoot 'processes.json')
  Require ($s.browserMode -ceq 'external-chrome-dev')
  $k = $s.kernel; Require ([long]$k.ProcessId -gt 0)
  $p = Get-CimInstance Win32_Process -Filter ("ProcessId=" + [long]$k.ProcessId)
  Require ($null -ne $p)
  Require ($p.ExecutablePath -ieq $t.node); Require ($p.CommandLine -ceq $k.CommandLine)
  Require ($p.ExecutablePath -ieq $k.ExecutablePath)
  Require ($p.CommandLine.Contains((Join-Path $app 'dist-control/gamd.cjs')) -or $p.CommandLine.Contains((Join-Path $app 'dist-control\gamd.cjs')))
  # Exact PID reuse protection; unsupported timestamp encodings block.
  $recorded = if ([string]$k.CreationDate -match '^/Date\((-?\d+)\)/$') { [long]$Matches[1] } else { ([DateTimeOffset]::Parse([string]$k.CreationDate)).ToUnixTimeMilliseconds() }
  Require (([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds() -eq $recorded)
  Require ((Hash $t.node) -ceq $t.nodeSha256)
  Record 'owned Kernel PID (command line withheld)' 'INFO' ([string]$p.ProcessId)
}
Check 'data file observational fingerprints (not a backup)' {
  foreach ($name in @('global.db','global.db-wal','global.db-shm')) {
    $path = Join-Path $TrialRoot ('data\' + $name)
    if (Test-Path -LiteralPath $path -PathType Leaf) {
      $before = Get-Item -LiteralPath $path; $digest = Hash $path; $after = Get-Item -LiteralPath $path
      Require ($before.Length -eq $after.Length -and $before.LastWriteTimeUtc -eq $after.LastWriteTimeUtc)
      Record $name 'INFO' "$($after.Length) bytes SHA256=$digest (live, non-atomic observation)"
    } elseif ($name -eq 'global.db') { throw 'Missing database' }
  }
}
Check 'candidate exact source / entries / original dist fingerprint' {
  $head = & git --no-optional-locks -C $CandidateRoot rev-parse HEAD 2>$null
  Require ($LASTEXITCODE -eq 0 -and $head -ceq $sha)
  $dirty = & git --no-optional-locks -C $CandidateRoot status --porcelain --untracked-files=all 2>$null
  Require ($LASTEXITCODE -eq 0 -and !$dirty)
  $m = ReadJson (SafeFile $CandidateRoot 'manifest.json')
  Require ($null -ne $oldManifest); Require ($m.key -ceq $oldManifest.key)
  Require ((ExtensionId $m.key) -ceq $t.extensionId)
  foreach ($f in @('dist\background.js','dist\content.js','dist\sidepanel.js','dist\sidepanel.html','dist\sidepanel.css','dist-control\gamd.cjs','dist-control\gamctl.cjs','dist-control\gam.cjs','dist-control\dashboard\index.html','dist-native-host\GamNativeHost.exe')) {
    Record ('candidate ' + $f) 'INFO' (Hash (SafeFile $CandidateRoot $f))
  }
  $meta = ReadJson (SafeFile $CandidateRoot 'dist\build-meta.json')
  Require ($meta.sourceFingerprint.StartsWith('9c2e266d39c80e3b'))
  foreach ($f in $meta.files.PSObject.Properties) { Require ((Hash (SafeFile $CandidateRoot ('dist\' + $f.Name))) -ceq $f.Value) }
  # Do not execute candidate JS / EXE during read-only diagnostics.
}
Record 'candidate immutable installation and complete SHA256 manifest' 'BLOCKED' 'Not staged; raw build is not a trial-bound release. See rollback-plan.md.'
Record 'Kernel health / registered Project / Fleet / bindings' 'BLOCKED' 'No RPC invoked. Operator must inspect existing read-only UI snapshot: 1 group, 2 projects, 2 Developers, 3 conversations and exact IDs/leases/Attempts; never reconcile or create.'
Record 'Chrome Dev Default actual loaded extension path' 'BLOCKED' 'Inspect chrome://version Profile Path and chrome://extensions ID/details + service-worker source path manually; no reload while editing. Profile files are not read.'
Record 'database backup / schema compatibility' 'BLOCKED' 'No database opened or backup written. Candidate schema=30; live schema and old-reader compatibility unknown. Authorized consistent backup and migration rehearsal required.'
[pscustomobject]@{ status='BLOCKED'; candidateBusinessSource=$sha; checks=$results; secrets='Tokens/cookies/profile contents and process command lines were not emitted'; actions='Read-only diagnostics only; no install/switch/restart/send' } | ConvertTo-Json -Depth 7
exit 2
