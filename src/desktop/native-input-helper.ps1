$ErrorActionPreference = "Continue"

$signature = @"
using System;
using System.Runtime.InteropServices;

public static class NativeInput {
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT {
    public uint type;
    public InputUnion U;
  }

  [StructLayout(LayoutKind.Explicit)]
  public struct InputUnion {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT {
    public int dx;
    public int dy;
    public uint mouseData;
    public uint dwFlags;
    public uint time;
    public UIntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public ushort wVk;
    public ushort wScan;
    public uint dwFlags;
    public uint time;
    public UIntPtr dwExtraInfo;
  }

  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern short VkKeyScan(char ch);

  [DllImport("user32.dll")]
  public static extern bool GetCursorPos(out POINT lpPoint);

  [StructLayout(LayoutKind.Sequential)]
  public struct POINT {
    public int X;
    public int Y;
  }
}
"@

Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition $signature

$INPUT_MOUSE = 0
$INPUT_KEYBOARD = 1
$MOUSEEVENTF_LEFTDOWN = 0x0002
$MOUSEEVENTF_LEFTUP = 0x0004
$MOUSEEVENTF_RIGHTDOWN = 0x0008
$MOUSEEVENTF_RIGHTUP = 0x0010
$MOUSEEVENTF_MIDDLEDOWN = 0x0020
$MOUSEEVENTF_MIDDLEUP = 0x0040
$KEYEVENTF_KEYUP = 0x0002
$KEYEVENTF_SCANCODE = 0x0008

function Send-MouseInput {
  param([uint32]$Flags)

  $input = New-Object NativeInput+INPUT
  $input.type = $INPUT_MOUSE
  $input.U.mi.dx = 0
  $input.U.mi.dy = 0
  $input.U.mi.mouseData = 0
  $input.U.mi.dwFlags = $Flags
  $input.U.mi.time = 0
  $input.U.mi.dwExtraInfo = [UIntPtr]::Zero
  [NativeInput]::SendInput(1, @($input), [Runtime.InteropServices.Marshal]::SizeOf([type][NativeInput+INPUT])) | Out-Null
}

function Send-KeyboardInput {
  param([uint16]$VirtualKey, [bool]$IsKeyUp)

  $input = New-Object NativeInput+INPUT
  $input.type = $INPUT_KEYBOARD
  $input.U.ki.wVk = $VirtualKey
  $input.U.ki.wScan = 0
  $input.U.ki.dwFlags = $(if ($IsKeyUp) { $KEYEVENTF_KEYUP } else { 0 })
  $input.U.ki.time = 0
  $input.U.ki.dwExtraInfo = [UIntPtr]::Zero
  [NativeInput]::SendInput(1, @($input), [Runtime.InteropServices.Marshal]::SizeOf([type][NativeInput+INPUT])) | Out-Null
}

function Get-VirtualKey {
  param([string]$Key, [string]$Code)

  $special = @{
    "Enter" = 0x0D
    "Backspace" = 0x08
    "Tab" = 0x09
    "Escape" = 0x1B
    " " = 0x20
    "Space" = 0x20
    "ArrowLeft" = 0x25
    "ArrowUp" = 0x26
    "ArrowRight" = 0x27
    "ArrowDown" = 0x28
    "Delete" = 0x2E
    "Home" = 0x24
    "End" = 0x23
    "PageUp" = 0x21
    "PageDown" = 0x22
    "Control" = 0x11
    "Shift" = 0x10
    "Alt" = 0x12
  }

  if ($special.ContainsKey($Key)) {
    return [uint16]$special[$Key]
  }

  if ($Code -match '^Key([A-Z])$') {
    return [uint16][char]$Matches[1]
  }

  if ($Code -match '^Digit([0-9])$') {
    return [uint16][char]$Matches[1]
  }

  if ($Key -and $Key.Length -eq 1) {
    $scan = [NativeInput]::VkKeyScan($Key[0])
    if ($scan -ne -1) {
      return [uint16]($scan -band 0xff)
    }
  }

  return $null
}

function Move-Mouse {
  param([double]$X, [double]$Y)

  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $screenX = [Math]::Max($bounds.Left, [Math]::Min($bounds.Right - 1, [int]($bounds.Left + ($X * $bounds.Width))))
  $screenY = [Math]::Max($bounds.Top, [Math]::Min($bounds.Bottom - 1, [int]($bounds.Top + ($Y * $bounds.Height))))
  [NativeInput]::SetCursorPos($screenX, $screenY) | Out-Null
}

function Send-MouseButton {
  param([string]$Kind, [int]$Button)

  $flag = switch ("$Kind/$Button") {
    "mouse.down/0" { $MOUSEEVENTF_LEFTDOWN }
    "mouse.up/0" { $MOUSEEVENTF_LEFTUP }
    "mouse.down/1" { $MOUSEEVENTF_MIDDLEDOWN }
    "mouse.up/1" { $MOUSEEVENTF_MIDDLEUP }
    "mouse.down/2" { $MOUSEEVENTF_RIGHTDOWN }
    "mouse.up/2" { $MOUSEEVENTF_RIGHTUP }
    default { $null }
  }

  if ($null -ne $flag) {
    Send-MouseInput -Flags $flag
  }
}

function Send-Key {
  param([string]$Kind, [string]$Key, [string]$Code)

  $vk = Get-VirtualKey -Key $Key -Code $Code
  if ($null -eq $vk) {
    return
  }

  Send-KeyboardInput -VirtualKey $vk -IsKeyUp ($Kind -eq "key.up")
}

Write-Output "READY"

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) {
    Start-Sleep -Milliseconds 10
    continue
  }

  try {
    $remoteEvent = $line | ConvertFrom-Json

    switch ($remoteEvent.kind) {
      "mouse.move" {
        Move-Mouse -X ([double]$remoteEvent.x) -Y ([double]$remoteEvent.y)
      }
      "mouse.down" {
        Send-MouseButton -Kind $remoteEvent.kind -Button ([int]$remoteEvent.button)
      }
      "mouse.up" {
        Send-MouseButton -Kind $remoteEvent.kind -Button ([int]$remoteEvent.button)
      }
      "key.down" {
        Send-Key -Kind $remoteEvent.kind -Key $remoteEvent.key -Code $remoteEvent.code
      }
      "key.up" {
        Send-Key -Kind $remoteEvent.kind -Key $remoteEvent.key -Code $remoteEvent.code
      }
    }
  } catch {
    Write-Error $_
  }
}
