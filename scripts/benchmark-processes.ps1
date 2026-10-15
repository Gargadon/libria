param(
    [Parameter(Mandatory=$true)][int]$RootProcessId,
    [Parameter(Mandatory=$true)][string]$PhaseFile,
    [Parameter(Mandatory=$true)][string]$OutputFile,
    [Parameter(Mandatory=$true)][string]$StopFile
)
$ErrorActionPreference = 'Stop'
$known = @{}
$known[$RootProcessId] = (Get-Process -Id $RootProcessId).StartTime.ToUniversalTime().Ticks
$cpu = @{}
$clock = [Diagnostics.Stopwatch]::StartNew()
$writer = [IO.StreamWriter]::new($OutputFile, $false, [Text.UTF8Encoding]::new($false))
try {
    while (!(Test-Path -LiteralPath $StopFile)) {
        $started = $clock.Elapsed.TotalSeconds
        $phase = [IO.File]::ReadAllText($PhaseFile)
        $all = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId)
        foreach ($id in @($known.Keys)) {
            $process = Get-Process -Id $id -ErrorAction SilentlyContinue
            if (!$process -or $process.StartTime.ToUniversalTime().Ticks -ne $known[$id]) {
                $known.Remove($id)
            }
        }
        do {
            $added = $false
            foreach ($item in $all) {
                $id = [int]$item.ProcessId
                if (!$known.ContainsKey($id) -and $known.ContainsKey([int]$item.ParentProcessId)) {
                    $child = Get-Process -Id $id -ErrorAction SilentlyContinue
                    # Windows can reuse a parent PID held by an unrelated, older child.
                    # A real descendant must have been created after its tracked parent.
                    if ($child -and $child.StartTime.ToUniversalTime().Ticks -ge $known[[int]$item.ParentProcessId]) {
                        $known[$id] = $child.StartTime.ToUniversalTime().Ticks
                        $added = $true
                    }
                }
            }
        } while ($added)
        $rows = @()
        foreach ($id in @($known.Keys)) {
            $process = Get-Process -Id $id -ErrorAction SilentlyContinue
            if (!$process) { continue }
            try {
                $key = "$id/$($process.StartTime.ToUniversalTime().Ticks)"
                if ($process.StartTime.ToUniversalTime().Ticks -ne $known[$id]) { continue }
                $cpu[$key] = $process.TotalProcessorTime.TotalSeconds
                $rows += @{ pid=$id; name=$process.ProcessName; cpuSeconds=$cpu[$key]; workingSetBytes=$process.WorkingSet64; privateBytes=$process.PrivateMemorySize64 }
            } catch { continue }
        }
        $totalCpu = 0.0
        foreach ($value in $cpu.Values) { $totalCpu += $value }
        $writer.WriteLine((@{ seconds=$clock.Elapsed.TotalSeconds; phase=$phase; cpuSeconds=$totalCpu; processes=$rows } | ConvertTo-Json -Compress -Depth 5))
        $writer.Flush()
        $remaining = 1000 - [int](($clock.Elapsed.TotalSeconds - $started) * 1000)
        if ($remaining -gt 0) { Start-Sleep -Milliseconds $remaining }
    }
} finally { $writer.Dispose() }
