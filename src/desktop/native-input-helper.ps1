Add-Type -AssemblyName System.Windows.Forms

$signature = @"
using System;
using System.Runtime.InteropServices;

public static class NativeInput {
  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);

  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern short VkKeyScan(char ch);
}
"@

Add-Type -TypeDefinition $signature

$MOUSEEVENTF_LEFTDOWN = 0x0002
$MOUSEEVENTF_LEFTUP = 0x0004
$MOUSEEVENTF_RIGHTDOWN = 0x0008
$MOUSEEVENTF_RIGHTUP = 0x0010
$MOUSEEVENTF_MIDDLEDOWN = 0x0020
$MOUSEEVENTF_MIDDLEUP = 0x0040
$KEYEVENTF_KEYUP = 0x0002

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
  }

  if ($special.ContainsKey($Key)) {
    return [byte]$special[$Key]
  }

  if ($Code -match '^Key([A-Z])$') {
    return [byte][char]$Matches[1]
  }

  if ($Code -match '^Digit([0-9])$') {
    return [byte][char]$Matches[1]
  }

  if ($Key -and $Key.Length -eq 1) {
    $scan = [NativeInput]::VkKeyScan($Key[0])
    if ($scan -ne -1) {
      return [byte]($scan -band 0xff)
    }
  }

  return $null
}

function Move-Mouse {
  param([double]$X, [double]$Y)

  $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
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
    [NativeInput]::mouse_event($flag, 0, 0, 0, [UIntPtr]::Zero)
  }
}

function Send-Key {
  param([string]$Kind, [string]$Key, [string]$Code)

  $vk = Get-VirtualKey -Key $Key -Code $Code
  if ($null -eq $vk) {
    return
  }

  if ($Kind -eq "key.up") {
    [NativeInput]::keybd_event($vk, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  } else {
    [NativeInput]::keybd_event($vk, 0, 0, [UIntPtr]::Zero)
  }
}

Write-Output "READY"

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) {
    Start-Sleep -Milliseconds 10
    continue
  }

  try {
    $event = $line | ConvertFrom-Json

    switch ($event.kind) {
      "mouse.move" {
        Move-Mouse -X ([double]$event.x) -Y ([double]$event.y)
      }
      "mouse.down" {
        Send-MouseButton -Kind $event.kind -Button ([int]$event.button)
      }
      "mouse.up" {
        Send-MouseButton -Kind $event.kind -Button ([int]$event.button)
      }
      "key.down" {
        Send-Key -Kind $event.kind -Key $event.key -Code $event.code
      }
      "key.up" {
        Send-Key -Kind $event.kind -Key $event.key -Code $event.code
      }
    }
  } catch {
    Write-Error $_
  }
}
