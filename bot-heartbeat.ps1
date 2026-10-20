# Bot heartbeat + alert watchdog.
# Runs every minute from Task Scheduler "BotHeartbeat".
# Healthy  -> appends a heartbeat line every 5 minutes.
# Unhealthy (2 consecutive misses) -> Windows toast + alert log, 30 min cooldown.
param([switch]$Test, [switch]$Force)

$ErrorActionPreference = 'SilentlyContinue'
$root   = 'D:\Cogito\Cogito-bot'
$logs   = Join-Path $root 'logs'
$log    = Join-Path $logs 'heartbeat.log'
$alert  = Join-Path $logs 'alerts.log'
$stateF = Join-Path $root 'data\heartbeat-state.json'
$supLog = Join-Path $logs 'supervisor.log'
New-Item -ItemType Directory -Path $logs -Force | Out-Null

function Now { Get-Date }
function Stamp { (Now).ToString('yyyy-MM-dd HH:mm:ss') }

function Send-Toast([string]$title, [string]$text) {
    try {
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
        $xml = @"
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>$title</text>
      <text>$text</text>
    </binding>
  </visual>
</toast>
"@
        $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
        $doc.LoadXml($xml)
        $toast = New-Object Windows.UI.Notifications.ToastNotification $doc
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Cogito Bot').Show($toast)
        return $true
    } catch {
        return $false
    }
}

# ---- probe ----
$proc = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'src[\\/]index\.js' })
$portOpen = $false
try {
    $client = New-Object Net.Sockets.TcpClient
    $iar = $client.BeginConnect('127.0.0.1', 8787, $null, $null)
    if ($iar.AsyncWaitHandle.WaitOne(2000)) { $client.EndConnect($iar); $portOpen = $true }
    $client.Close()
} catch { }

$healthy = ($proc.Count -gt 0) -and $portOpen

# ---- state ----
$state = @{ fails = 0; lastBeat = 0; lastAlert = 0 }
if (Test-Path $stateF) {
    try {
        $o = Get-Content $stateF -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($p in $o.PSObject.Properties) { $state[$p.Name] = $p.Value }
    } catch { }
}

$nowEpoch = [int][double]::Parse((Get-Date -UFormat %s))
$restarts = 0
if (Test-Path $supLog) {
    $cut = (Now).AddMinutes(-30)
    foreach ($line in (Get-Content $supLog -Tail 200 -Encoding UTF8)) {
        if ($line -match '^\[(\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2})\] \[ACTION\]') {
            try { if ([datetime]::ParseExact($Matches[1], 'yyyy/MM/dd HH:mm:ss', $null) -ge $cut) { $restarts++ } } catch { }
        }
    }
}

if ($healthy) {
    $state.fails = 0
    if (($nowEpoch - [int]$state.lastBeat) -ge 300) {
        $state.lastBeat = $nowEpoch
        Add-Content -LiteralPath $log -Value ("[{0}] alive pid={1} console=up restarts30m={2}" -f (Stamp), ($proc.ProcessId -join ','), $restarts) -Encoding UTF8
    }
} else {
    $state.fails = [int]$state.fails + 1
    if (($state.fails -ge 2 -or $Force) -and ($nowEpoch - [int]$state.lastAlert) -ge 1800) {
        $state.lastAlert = $nowEpoch
        $reason = if ($proc.Count -eq 0) { '进程不存在' } elseif (-not $portOpen) { '控制台 8787 无响应' } else { '未知' }
        $tail = (Get-Content (Join-Path $logs 'bot.log') -Tail 3 -Encoding UTF8) -join ' | '
        $msg = "原因：$reason；30 分钟内重启 $restarts 次；最近日志：$tail"
        $toastOk = Send-Toast 'Cogito 机器人掉线' $msg
        Add-Content -LiteralPath $alert -Value ("[{0}] ALERT {1} toast={2}" -f (Stamp), $msg, $toastOk) -Encoding UTF8
        Write-Output "ALERT $msg toast=$toastOk"
    }
}

$state | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $stateF -Encoding UTF8
if ($Test) { Write-Output ("healthy={0} proc={1} port={2} fails={3} restarts30m={4}" -f $healthy, $proc.Count, $portOpen, $state.fails, $restarts) }
exit 0
