# Lista os PIDs com uma sessão de captura de áudio ATIVA no Windows (Core Audio),
# um por linha. É o sinal por trás do ícone de microfone na bandeja e não exige
# administrador. Usado por validar-ditado-windows.cjs.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int EnumAudioEndpoints(int flow, int mask, out IMMDeviceCollection devices); }
[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceCollection { int GetCount(out int count); int Item(int index, out IMMDevice device); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid iid, int context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object value); }
[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 { int Slot3(); int Slot4(); int GetSessionEnumerator(out IAudioSessionEnumerator sessions); }
[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator { int GetCount(out int count); int GetSession(int index, [MarshalAs(UnmanagedType.IUnknown)] out object session); }
[Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
  int GetState(out int state); int Slot4(); int Slot5(); int Slot6(); int Slot7(); int Slot8(); int Slot9(); int Slot10(); int Slot11();
  int Slot12(); int Slot13(); int GetProcessId(out uint pid);
}
public static class Capturas {
  public static List<uint> Ativas() {
    var pids = new List<uint>();
    var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
    IMMDeviceCollection devices; Marshal.ThrowExceptionForHR(enumerator.EnumAudioEndpoints(1, 1, out devices));
    int total; devices.GetCount(out total);
    for (int d = 0; d < total; d++) {
      IMMDevice device; devices.Item(d, out device);
      var iid = typeof(IAudioSessionManager2).GUID; object manager;
      if (device.Activate(ref iid, 23, IntPtr.Zero, out manager) != 0) continue;
      IAudioSessionEnumerator sessions; ((IAudioSessionManager2)manager).GetSessionEnumerator(out sessions);
      int count; sessions.GetCount(out count);
      for (int s = 0; s < count; s++) {
        object raw; sessions.GetSession(s, out raw);
        var control = (IAudioSessionControl2)raw; int state; uint pid; control.GetState(out state); control.GetProcessId(out pid);
        if (state == 1) pids.Add(pid);
      }
    }
    return pids;
  }
}
'@
[Capturas]::Ativas()
