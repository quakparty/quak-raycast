# Talk to Speakers on Windows: records the microphone with what Windows brings (winmm.dll, MCI), no extra install.
# Runs in Windows PowerShell 5.1 (powershell.exe). The extension starts it with -EncodedCommand (src/lib/recorder-windows.ts)
# and steers it through files in a folder, like the Swift helper on macOS (swift/Sources/Recorder.swift):
# - audio.wav: the recording (PCM, 16 bit, mono), written here on "send" or at the limit
# - started: created once the microphone records
# - heartbeat: touched by the extension every 500 ms; older than 3 s means the command is gone
# - stop: written by the extension, "send" keeps the audio, "cancel" discards it and deletes the folder
# Input from the environment: QUAK_TALK_DIR (the folder), QUAK_TALK_MAX (seconds), QUAK_TALK_PARENT (the extension's
# process id; when it ends, the recording is discarded).
# Output: one line of JSON on stdout, {"path", "seconds", "reason"} with reason "stopped", "limit" or "cancelled".
# Errors: one line "CODE: message" on stderr and exit code 1, CODE is MICROPHONE_DENIED, NO_MICROPHONE or
# RECORDING_FAILED.
#
# Standalone test (no QUAK_TALK_DIR): records into a new temp folder, Enter keeps the audio, Esc discards it:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\talk-recorder.ps1

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }

$source = @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public static class QuakMci {
  [DllImport("winmm.dll", EntryPoint = "mciSendStringW", CharSet = CharSet.Unicode)]
  private static extern int mciSendString(string command, StringBuilder buffer, int size, IntPtr callback);

  [DllImport("winmm.dll", EntryPoint = "mciGetErrorStringW", CharSet = CharSet.Unicode)]
  private static extern bool mciGetErrorString(int error, StringBuilder buffer, int size);

  [DllImport("winmm.dll")]
  public static extern uint waveInGetNumDevs();

  public static int Send(string command) {
    return mciSendString(command, null, 0, IntPtr.Zero);
  }

  public static string ErrorText(int error) {
    StringBuilder buffer = new StringBuilder(256);
    return mciGetErrorString(error, buffer, buffer.Capacity) ? buffer.ToString() : "MCI error";
  }

  // The loudest sample of a PCM WAV file, 0 to 32768; -1 without audio data
  public static int Peak(string path) {
    byte[] data = File.ReadAllBytes(path);
    int bits = 16;
    int offset = 12;
    while (offset + 8 <= data.Length) {
      string id = Encoding.ASCII.GetString(data, offset, 4);
      int size = BitConverter.ToInt32(data, offset + 4);
      int start = offset + 8;
      if (size < 0 || start + size > data.Length) size = data.Length - start;
      if (id == "fmt " && size >= 16) bits = BitConverter.ToInt16(data, start + 14);
      if (id == "data") {
        if (size == 0) return -1;
        int peak = 0;
        if (bits == 8) {
          for (int i = start; i < start + size; i++) peak = Math.Max(peak, Math.Abs(data[i] - 128) * 256);
        } else {
          for (int i = start; i + 1 < start + size; i += 2) peak = Math.Max(peak, Math.Abs((int)BitConverter.ToInt16(data, i)));
        }
        return peak;
      }
      offset = start + size + (size % 2);
    }
    return -1;
  }
}
'@

$alias = 'quakrec'
$standalone = -not $env:QUAK_TALK_DIR
$opened = $false

function Fail([string]$code, [string]$message) {
  throw ($code + ': ' + $message)
}

# An MCI command; a failure ends the recording with the MCI's own text
function Mci([string]$command) {
  $result = [QuakMci]::Send($command)
  if ($result -ne 0) {
    $text = [QuakMci]::ErrorText($result)
    # MCIERR_WAVE_INPUTUNSPECIFIED: no recording device
    if ($result -eq 325) { Fail 'NO_MICROPHONE' 'No microphone found' }
    Fail 'RECORDING_FAILED' ($text + ' (MCI ' + $result + ')')
  }
}

# Settings -> Privacy & security -> Microphone: access off for this device, for this user or for desktop apps
function Test-Denied {
  $store = 'SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone'
  $keys = @(
    @([Microsoft.Win32.Registry]::LocalMachine, $store),
    @([Microsoft.Win32.Registry]::CurrentUser, $store),
    @([Microsoft.Win32.Registry]::CurrentUser, ($store + '\NonPackaged'))
  )
  foreach ($entry in $keys) {
    try {
      $key = $entry[0].OpenSubKey($entry[1])
      if ($key) {
        $value = $key.GetValue('Value')
        $key.Close()
        if ($value -eq 'Deny') { return $true }
      }
    } catch { }
  }
  return $false
}

function Read-Stop {
  if ($standalone) {
    try {
      while ([Console]::KeyAvailable) {
        $key = [Console]::ReadKey($true)
        if ($key.Key -eq 'Enter') { return 'send' }
        if ($key.Key -eq 'Escape') { return 'cancel' }
      }
    } catch { }
  }
  $path = Join-Path $dir 'stop'
  if (Test-Path -LiteralPath $path) {
    try { return ([IO.File]::ReadAllText($path)).Trim() } catch { }
  }
  return $null
}

# The command unloaded without saying so (Raycast closed, the extension crashed): no heartbeat, or no parent
function Test-Abandoned {
  if ($standalone) { return $false }
  if ($parent) {
    try { if ($parent.HasExited) { return $true } } catch { }
  }
  $heartbeat = Join-Path $dir 'heartbeat'
  try {
    if (-not (Test-Path -LiteralPath $heartbeat)) { return $true }
    return ([DateTime]::UtcNow - [IO.File]::GetLastWriteTimeUtc($heartbeat)).TotalSeconds -gt 3
  } catch {
    return $true
  }
}

function Remove-Folder {
  try {
    [IO.Directory]::SetCurrentDirectory([IO.Path]::GetTempPath())
    Remove-Item -LiteralPath $dir -Recurse -Force
  } catch { }
}

function Write-Result([double]$seconds, [string]$reason) {
  $json = @{ path = $file; seconds = [Math]::Round($seconds, 2); reason = $reason } | ConvertTo-Json -Compress
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}

try {
  if ($standalone) {
    $dir = Join-Path ([IO.Path]::GetTempPath()) ('quak-talk-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $dir | Out-Null
  } else {
    $dir = $env:QUAK_TALK_DIR
  }
  $max = 180.0
  if ($env:QUAK_TALK_MAX) { $max = [double]::Parse($env:QUAK_TALK_MAX, [Globalization.CultureInfo]::InvariantCulture) }
  $parent = $null
  if ($env:QUAK_TALK_PARENT) {
    try { $parent = [Diagnostics.Process]::GetProcessById([int]$env:QUAK_TALK_PARENT) } catch {
      # the extension is already gone
      Remove-Folder
      Write-Result 0 'cancelled'
      exit 0
    }
  }
  $file = Join-Path $dir 'audio.wav'
  if ($standalone) { [Console]::Error.WriteLine('Recording into ' + $file + ' - Enter keeps it, Esc discards it') }

  try { Add-Type -TypeDefinition $source -Language CSharp } catch { Fail 'RECORDING_FAILED' ('Could not load winmm.dll: ' + $_.Exception.Message) }

  if ([QuakMci]::waveInGetNumDevs() -eq 0) { Fail 'NO_MICROPHONE' 'No microphone found' }
  if (Test-Denied) { Fail 'MICROPHONE_DENIED' 'Desktop apps may not use the microphone' }

  # 16 bit mono below the API's upload limit of 10 MB: 22.05 kHz (44 KB/s) holds 3:57, longer limits get 11.025 kHz
  $rate = 22050
  if (($max + 1) * 2 * $rate + 4096 -gt 10MB) { $rate = 11025 }
  $bytes = $rate * 2

  Mci ('open new type waveaudio alias ' + $alias)
  $opened = $true
  # all wave settings in one command, some drivers reject a single changed value; the defaults (11 kHz, 8 bit) stay otherwise
  $format = 'set ' + $alias + ' time format ms format tag pcm channels 1 samplespersec ' + $rate + ' bytespersec ' + $bytes + ' alignment 2 bitspersample 16'
  if ([QuakMci]::Send($format) -ne 0) {
    [void][QuakMci]::Send('set ' + $alias + ' bitspersample 16 channels 1 samplespersec ' + $rate + ' bytespersec ' + $bytes + ' alignment 2')
  }

  # the extension may have given up while PowerShell compiled the helper
  if ((Read-Stop) -or (Test-Abandoned)) {
    [void][QuakMci]::Send('close ' + $alias)
    $opened = $false
    Remove-Folder
    Write-Result 0 'cancelled'
    exit 0
  }

  Mci ('record ' + $alias)
  $watch = [Diagnostics.Stopwatch]::StartNew()
  [IO.File]::WriteAllText((Join-Path $dir 'started'), '')

  $reason = $null
  while (-not $reason) {
    Start-Sleep -Milliseconds 200
    $command = Read-Stop
    if (-not $command -and (Test-Abandoned)) { $command = 'cancel' }
    if ($command -eq 'cancel') { $reason = 'cancelled' } elseif ($command -eq 'send') { $reason = 'stopped' } elseif ($watch.Elapsed.TotalSeconds -ge $max) { $reason = 'limit' }
  }
  $seconds = [Math]::Min($watch.Elapsed.TotalSeconds, $max)
  [void][QuakMci]::Send('stop ' + $alias)

  if ($reason -eq 'cancelled') {
    [void][QuakMci]::Send('close ' + $alias)
    $opened = $false
    Remove-Folder
    Write-Result $seconds 'cancelled'
    exit 0
  }

  # the quoted full path first; if MCI rejects it, the bare name in the folder (no quoting, no long path)
  if ([QuakMci]::Send('save ' + $alias + ' "' + $file + '"') -ne 0) {
    [IO.Directory]::SetCurrentDirectory($dir)
    try { Mci ('save ' + $alias + ' audio.wav') } finally { [IO.Directory]::SetCurrentDirectory([IO.Path]::GetTempPath()) }
  }
  [void][QuakMci]::Send('close ' + $alias)
  $opened = $false

  if (-not (Test-Path -LiteralPath $file)) { Fail 'RECORDING_FAILED' 'The recording was not saved' }
  # without access Windows hands desktop apps silence instead of an error
  $peak = [QuakMci]::Peak($file)
  if ($peak -lt 0) { Fail 'RECORDING_FAILED' 'The recording is empty' }
  if ($peak -le 1 -and $seconds -ge 0.5) {
    Fail 'MICROPHONE_DENIED' 'The recording is silent: allow desktop apps to use the microphone and check that it is not muted'
  }
  Write-Result $seconds $reason
  exit 0
} catch {
  if ($opened) { try { [void][QuakMci]::Send('close ' + $alias) } catch { } }
  $message = [string]$_.Exception.Message
  if ($message -notmatch '^(MICROPHONE_DENIED|NO_MICROPHONE|RECORDING_FAILED): ') { $message = 'RECORDING_FAILED: ' + $message }
  [Console]::Error.WriteLine($message)
  exit 1
}
