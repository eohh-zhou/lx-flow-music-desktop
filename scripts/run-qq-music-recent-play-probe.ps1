param(
  [string]$SongMid = '0034Ge6Q2b504d',
  [switch]$Write,
  [string]$NodePath = ''
)

$probePath = Join-Path $PSScriptRoot 'qq-music-recent-play-probe.mjs'

function Resolve-NodePath {
  param([string]$RequestedPath)

  if ($RequestedPath) {
    $command = Get-Command $RequestedPath -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
    if (Test-Path -LiteralPath $RequestedPath -PathType Leaf) {
      return (Resolve-Path -LiteralPath $RequestedPath).Path
    }
    throw "Node.js was not found at '$RequestedPath'."
  }

  $command = Get-Command node -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidates = @(
    (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
    (Join-Path $env:ProgramFiles 'nodejs\node.exe')
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      return $candidate
    }
  }

  throw 'Node.js was not found. Install Node.js or rerun with -NodePath <path-to-node.exe>.'
}

$resolvedNodePath = Resolve-NodePath $NodePath
$secureCookie = Read-Host 'Paste the y.qq.com Cookie header (input is hidden)' -AsSecureString
$cookiePtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureCookie)

try {
  $cookie = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($cookiePtr)
  if ([string]::IsNullOrWhiteSpace($cookie)) {
    throw 'Cookie cannot be empty.'
  }

  $probeArgs = @($probePath, '--song-mid', $SongMid)
  if ($Write) {
    $confirmation = Read-Host "Type WRITE to add one play for song MID $SongMid"
    if ($confirmation -cne 'WRITE') {
      throw 'Write cancelled.'
    }
    $probeArgs += @('--write', '--confirm-write')
  }

  $env:QQ_MUSIC_COOKIE = $cookie
  & $resolvedNodePath @probeArgs
  exit $LASTEXITCODE
} finally {
  Remove-Item Env:QQ_MUSIC_COOKIE -ErrorAction SilentlyContinue
  $cookie = $null
  if ($cookiePtr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($cookiePtr)
  }
}
